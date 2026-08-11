//! Zero-install system-audio capture on macOS, via Core Audio process taps.
//!
//! Recording "everyone else on the call" is the whole point of the app, but
//! until now macOS users had to find and install a virtual device (BlackHole)
//! themselves — so in practice every Mac recording was half a conversation.
//!
//! macOS 14.2+ can tap the system mix directly: build a `CATapDescription`
//! covering every process, wrap it in a **private** aggregate device, and pull
//! frames off that device with an IO callback.
//!
//! The aggregate has to be private. A public one is created but comes back
//! malformed (its stream format reads as `kAudioHardwareBadObjectError`).
//! Private devices are excluded from `kAudioHardwarePropertyDevices`, even for
//! the process that made them, which is why this can't just be handed to cpal
//! as a normal input device and needs its own IO proc.
//!
//! Everything below is a straight port of a standalone probe that was verified
//! on macOS 26.5: tap + aggregate created, 109k frames captured in 2.3s with a
//! non-zero peak while a sound played.

#![cfg(target_os = "macos")]

use std::ffi::{c_void, CString};
use std::os::raw::c_char;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::audio::SharedSink;

type OSStatus = i32;
type AudioObjectID = u32;
type CFTypeRef = *const c_void;

/// Name shown for this capture source in the device picker.
pub const DEVICE_LABEL: &str = "System audio (this Mac)";

#[repr(C)]
struct Addr {
    selector: u32,
    scope: u32,
    element: u32,
}

const SCOPE_GLOBAL: u32 = 0x676c_6f62; // 'glob'
const SCOPE_INPUT: u32 = 0x696e_7074; // 'inpt'
const TAP_UID: u32 = 0x7475_6964; // 'tuid'
const STREAM_FORMAT: u32 = 0x7366_6d74; // 'sfmt'
const UTF8: u32 = 0x0800_0100;

#[repr(C)]
struct AudioBuffer {
    channels: u32,
    byte_size: u32,
    data: *mut c_void,
}
#[repr(C)]
struct AudioBufferList {
    count: u32,
    buffers: [AudioBuffer; 1],
}

#[repr(C)]
#[derive(Default)]
struct StreamDescription {
    sample_rate: f64,
    format_id: u32,
    format_flags: u32,
    bytes_per_packet: u32,
    frames_per_packet: u32,
    bytes_per_frame: u32,
    channels_per_frame: u32,
    bits_per_channel: u32,
    reserved: u32,
}

type IOProc = extern "C" fn(
    AudioObjectID,
    *const c_void,
    *const AudioBufferList,
    *const c_void,
    *mut c_void,
    *const c_void,
    *mut c_void,
) -> OSStatus;

#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyData(
        obj: AudioObjectID,
        addr: *const Addr,
        qsz: u32,
        q: *const c_void,
        size: *mut u32,
        out: *mut c_void,
    ) -> OSStatus;
    fn AudioHardwareCreateProcessTap(desc: *mut c_void, tap: *mut AudioObjectID) -> OSStatus;
    fn AudioHardwareDestroyProcessTap(tap: AudioObjectID) -> OSStatus;
    fn AudioHardwareCreateAggregateDevice(dict: CFTypeRef, dev: *mut AudioObjectID) -> OSStatus;
    fn AudioHardwareDestroyAggregateDevice(dev: AudioObjectID) -> OSStatus;
    fn AudioDeviceCreateIOProcID(
        dev: AudioObjectID,
        proc_: IOProc,
        client: *mut c_void,
        id: *mut *mut c_void,
    ) -> OSStatus;
    fn AudioDeviceDestroyIOProcID(dev: AudioObjectID, id: *mut c_void) -> OSStatus;
    fn AudioDeviceStart(dev: AudioObjectID, id: *mut c_void) -> OSStatus;
    fn AudioDeviceStop(dev: AudioObjectID, id: *mut c_void) -> OSStatus;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kCFTypeDictionaryKeyCallBacks: c_void;
    static kCFTypeDictionaryValueCallBacks: c_void;
    static kCFTypeArrayCallBacks: c_void;
    static kCFBooleanTrue: CFTypeRef;
    fn CFStringCreateWithCString(a: *const c_void, s: *const c_char, enc: u32) -> CFTypeRef;
    fn CFDictionaryCreateMutable(
        a: *const c_void,
        cap: isize,
        k: *const c_void,
        v: *const c_void,
    ) -> *mut c_void;
    fn CFDictionarySetValue(d: *mut c_void, k: CFTypeRef, v: CFTypeRef);
    fn CFArrayCreateMutable(a: *const c_void, cap: isize, cb: *const c_void) -> *mut c_void;
    fn CFArrayAppendValue(arr: *mut c_void, v: CFTypeRef);
    fn CFRelease(v: CFTypeRef);
}

#[link(name = "Foundation", kind = "framework")]
extern "C" {}

extern "C" {
    fn objc_getClass(name: *const c_char) -> *mut c_void;
    fn sel_registerName(name: *const c_char) -> *mut c_void;
    fn objc_msgSend();
}

unsafe fn cfstr(s: &str) -> CFTypeRef {
    let c = CString::new(s).unwrap_or_default();
    CFStringCreateWithCString(std::ptr::null(), c.as_ptr(), UTF8)
}

unsafe fn class(name: &str) -> *mut c_void {
    let c = CString::new(name).unwrap_or_default();
    objc_getClass(c.as_ptr())
}

unsafe fn sel(name: &str) -> *mut c_void {
    let c = CString::new(name).unwrap_or_default();
    sel_registerName(c.as_ptr())
}

unsafe fn send0(obj: *mut c_void, s: *mut c_void) -> *mut c_void {
    let f: extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, s)
}

unsafe fn send1(obj: *mut c_void, s: *mut c_void, a: *mut c_void) -> *mut c_void {
    let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> *mut c_void =
        std::mem::transmute(objc_msgSend as *const c_void);
    f(obj, s, a)
}

/// Where the IO callback writes. Boxed and handed to Core Audio as client data.
struct TapSink {
    sink: SharedSink,
    /// Flipped once we've seen a callback, so the UI can tell "no audio yet"
    /// from "the tap never started".
    got_audio: Arc<AtomicBool>,
}

extern "C" fn io_proc(
    _device: AudioObjectID,
    _now: *const c_void,
    input: *const AudioBufferList,
    _input_time: *const c_void,
    _output: *mut c_void,
    _output_time: *const c_void,
    client: *mut c_void,
) -> OSStatus {
    if input.is_null() || client.is_null() {
        return 0;
    }
    unsafe {
        let state = &*(client as *const TapSink);
        let list = &*input;
        let mut guard = match state.sink.lock() {
            Ok(g) => g,
            Err(_) => return 0,
        };
        for i in 0..list.count as usize {
            let buf = &*list.buffers.as_ptr().add(i);
            if buf.data.is_null() {
                continue;
            }
            // Taps deliver 32-bit float; the WAVs are 16-bit PCM like the mic.
            let samples = std::slice::from_raw_parts(buf.data as *const f32, (buf.byte_size / 4) as usize);
            for &s in samples {
                let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                if let Some(w) = guard.chunk.as_mut() {
                    let _ = w.write_sample(v);
                }
                if let Some(w) = guard.full.as_mut() {
                    let _ = w.write_sample(v);
                }
            }
        }
        state.got_audio.store(true, Ordering::Relaxed);
    }
    0
}

pub struct TapFormat {
    pub channels: u16,
    pub sample_rate: u32,
}

/// A live system-audio capture. Dropping it tears the whole thing down.
pub struct SystemAudioTap {
    tap: AudioObjectID,
    aggregate: AudioObjectID,
    proc_id: *mut c_void,
    /// Boxed `TapSink` handed to Core Audio; reclaimed on drop.
    client: *mut TapSink,
    running: bool,
}

// Core Audio object IDs and the boxed sink are safe to move between threads;
// the pointers are only dereferenced on the audio thread.
unsafe impl Send for SystemAudioTap {}

impl SystemAudioTap {
    /// Create the tap + aggregate device. Does not start capturing yet.
    pub fn open() -> Result<Self, String> {
        unsafe {
            let desc_cls = class("CATapDescription");
            if desc_cls.is_null() {
                return Err("CATapDescription unavailable (needs macOS 14.2+)".into());
            }
            // Global stereo mix, excluding no processes = everything you hear.
            let empty = send0(class("NSArray"), sel("array"));
            let desc = send1(
                send0(desc_cls, sel("alloc")),
                sel("initStereoGlobalTapButExcludeProcesses:"),
                empty,
            );
            if desc.is_null() {
                return Err("could not build the tap description".into());
            }
            let label = cfstr(DEVICE_LABEL);
            send1(desc, sel("setName:"), label as *mut c_void);

            let mut tap: AudioObjectID = 0;
            let st = AudioHardwareCreateProcessTap(desc, &mut tap);
            if st != 0 || tap == 0 {
                return Err(format!("could not create the system-audio tap (status {st})"));
            }

            let mut uid: CFTypeRef = std::ptr::null();
            let addr = Addr { selector: TAP_UID, scope: SCOPE_GLOBAL, element: 0 };
            let mut size = std::mem::size_of::<CFTypeRef>() as u32;
            let st = AudioObjectGetPropertyData(
                tap,
                &addr,
                0,
                std::ptr::null(),
                &mut size,
                &mut uid as *mut _ as *mut _,
            );
            if st != 0 || uid.is_null() {
                AudioHardwareDestroyProcessTap(tap);
                return Err(format!("could not read the tap UID (status {st})"));
            }

            let dict = CFDictionaryCreateMutable(
                std::ptr::null(),
                0,
                &kCFTypeDictionaryKeyCallBacks as *const _ as *const c_void,
                &kCFTypeDictionaryValueCallBacks as *const _ as *const c_void,
            );
            CFDictionarySetValue(dict, cfstr("name"), cfstr(DEVICE_LABEL));
            CFDictionarySetValue(dict, cfstr("uid"), cfstr("com.aimeeting.recorder.systemtap"));
            // Must be private — see the module comment.
            CFDictionarySetValue(dict, cfstr("private"), kCFBooleanTrue);
            CFDictionarySetValue(dict, cfstr("tapautostart"), kCFBooleanTrue);

            let entry = CFDictionaryCreateMutable(
                std::ptr::null(),
                0,
                &kCFTypeDictionaryKeyCallBacks as *const _ as *const c_void,
                &kCFTypeDictionaryValueCallBacks as *const _ as *const c_void,
            );
            CFDictionarySetValue(entry, cfstr("uid"), uid);
            CFDictionarySetValue(entry, cfstr("drift"), kCFBooleanTrue);
            let taps = CFArrayCreateMutable(
                std::ptr::null(),
                0,
                &kCFTypeArrayCallBacks as *const _ as *const c_void,
            );
            CFArrayAppendValue(taps, entry as CFTypeRef);
            CFDictionarySetValue(dict, cfstr("taps"), taps as CFTypeRef);

            let mut aggregate: AudioObjectID = 0;
            let st = AudioHardwareCreateAggregateDevice(dict as CFTypeRef, &mut aggregate);
            CFRelease(dict as CFTypeRef);
            CFRelease(uid);
            if st != 0 || aggregate == 0 {
                AudioHardwareDestroyProcessTap(tap);
                return Err(format!("could not create the tap's audio device (status {st})"));
            }

            Ok(Self {
                tap,
                aggregate,
                proc_id: std::ptr::null_mut(),
                client: std::ptr::null_mut(),
                running: false,
            })
        }
    }

    /// Sample rate and channel count the tap will deliver.
    pub fn format(&self) -> Result<TapFormat, String> {
        unsafe {
            let addr = Addr { selector: STREAM_FORMAT, scope: SCOPE_INPUT, element: 0 };
            let mut desc = StreamDescription::default();
            let mut size = std::mem::size_of::<StreamDescription>() as u32;
            let st = AudioObjectGetPropertyData(
                self.aggregate,
                &addr,
                0,
                std::ptr::null(),
                &mut size,
                &mut desc as *mut _ as *mut _,
            );
            if st != 0 || desc.sample_rate <= 0.0 || desc.channels_per_frame == 0 {
                return Err(format!("could not read the tap's audio format (status {st})"));
            }
            Ok(TapFormat {
                channels: desc.channels_per_frame as u16,
                sample_rate: desc.sample_rate as u32,
            })
        }
    }

    /// Begin writing captured audio into `sink`.
    pub fn start(&mut self, sink: SharedSink, got_audio: Arc<AtomicBool>) -> Result<(), String> {
        unsafe {
            let client = Box::into_raw(Box::new(TapSink { sink, got_audio }));
            let mut proc_id: *mut c_void = std::ptr::null_mut();
            let st =
                AudioDeviceCreateIOProcID(self.aggregate, io_proc, client as *mut c_void, &mut proc_id);
            if st != 0 || proc_id.is_null() {
                drop(Box::from_raw(client));
                return Err(format!("could not install the audio callback (status {st})"));
            }
            let st = AudioDeviceStart(self.aggregate, proc_id);
            if st != 0 {
                AudioDeviceDestroyIOProcID(self.aggregate, proc_id);
                drop(Box::from_raw(client));
                return Err(format!("could not start system-audio capture (status {st})"));
            }
            self.proc_id = proc_id;
            self.client = client;
            self.running = true;
            Ok(())
        }
    }
}

impl Drop for SystemAudioTap {
    fn drop(&mut self) {
        unsafe {
            if self.running && !self.proc_id.is_null() {
                AudioDeviceStop(self.aggregate, self.proc_id);
                AudioDeviceDestroyIOProcID(self.aggregate, self.proc_id);
            }
            if self.aggregate != 0 {
                AudioHardwareDestroyAggregateDevice(self.aggregate);
            }
            if self.tap != 0 {
                AudioHardwareDestroyProcessTap(self.tap);
            }
            // Only safe once the IO proc is torn down and can no longer fire.
            if !self.client.is_null() {
                drop(Box::from_raw(self.client));
            }
        }
    }
}

/// Is zero-install system capture available on this machine?
pub fn is_supported() -> bool {
    unsafe { !class("CATapDescription").is_null() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::time::Duration;

    /// End-to-end: tap the system mix, write it to a real WAV through the same
    /// `Sink` the recorder uses, and check we captured actual sound.
    ///
    /// Ignored by default — it needs working audio hardware and briefly plays a
    /// system sound. Run it with:
    ///   cargo test --lib system_audio -- --ignored --nocapture
    #[test]
    #[ignore]
    fn captures_real_system_audio_into_a_wav() {
        assert!(is_supported(), "CATapDescription missing — needs macOS 14.2+");

        let mut tap = SystemAudioTap::open().expect("open tap");
        let fmt = tap.format().expect("tap format");
        println!("tap format: {} Hz, {} ch", fmt.sample_rate, fmt.channels);

        let spec = hound::WavSpec {
            channels: fmt.channels,
            sample_rate: fmt.sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let path = std::env::temp_dir().join("meetly-system-tap-test.wav");
        let writer = hound::WavWriter::create(&path, spec).expect("create wav");
        let sink: SharedSink = Arc::new(Mutex::new(crate::audio::Sink {
            chunk: None,
            full: Some(writer),
        }));

        let got_audio = Arc::new(AtomicBool::new(false));
        tap.start(sink.clone(), got_audio.clone()).expect("start tap");

        std::process::Command::new("afplay")
            .arg("/System/Library/Sounds/Submarine.aiff")
            .spawn()
            .ok();
        std::thread::sleep(Duration::from_millis(2000));

        drop(tap); // stops capture before the writer is finalised
        let writer = sink.lock().unwrap().full.take().expect("writer");
        writer.finalize().expect("finalize wav");

        assert!(got_audio.load(Ordering::Relaxed), "the IO callback never fired");

        let reader = hound::WavReader::open(&path).expect("reopen wav");
        let samples: Vec<i16> = reader.into_samples::<i16>().filter_map(|s| s.ok()).collect();
        let peak = samples.iter().map(|s| s.unsigned_abs() as u32).max().unwrap_or(0);
        println!("captured {} samples, peak {peak}", samples.len());

        assert!(!samples.is_empty(), "tap produced no samples");
        assert!(peak > 0, "captured only silence — the tap is not receiving the system mix");
        let _ = std::fs::remove_file(&path);
    }
}
