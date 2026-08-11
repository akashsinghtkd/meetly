//! Phase-1 meeting detection.
//!
//! Signal: "is the microphone being used by *any* app right now?" On macOS this
//! is CoreAudio's `kAudioDevicePropertyDeviceIsRunningSomewhere` on the default
//! input device — true whenever Zoom/Teams/Meet (or anything) has the mic open.
//! It needs no Screen-Recording or Automation permission (only the mic access the
//! app already has), which keeps onboarding light. A background thread polls it
//! and emits `meeting-detected` / `meeting-ended`, and shows the floating overlay
//! window so the user can one-tap record.
//!
//! Windows detection is a stub for now (Phase 2) so the app still compiles there.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

static DETECTING: AtomicBool = AtomicBool::new(false);
/// Set when the user closes the pill; cleared when the mic goes idle, so a
/// dismissal lasts for the current call only.
static DISMISSED: AtomicBool = AtomicBool::new(false);

/// Fast enough that the pill is up before the user has finished saying hello.
const POLL: Duration = Duration::from_millis(1000);

#[derive(Clone, serde::Serialize)]
pub struct MeetingSignal {
    pub source: String,
}

/// Start the background poller (idempotent — only one thread ever runs).
#[tauri::command]
pub fn start_meeting_detection(app: AppHandle) {
    if DETECTING.swap(true, Ordering::SeqCst) {
        return;
    }

    // Never asked for the mic? Put the pill up now and let the user grant it
    // from there — that is also "the mic is being requested" case.
    if crate::mic_permission::status() == crate::mic_permission::MicAuth::Undetermined {
        let _ = app.emit("mic-permission-needed", ());
        crate::overlay::show(&app);
    }

    std::thread::spawn(move || {
        let mut last_active = false;
        while DETECTING.load(Ordering::SeqCst) {
            let device = active_input();
            let active = device.is_some();

            if active != last_active {
                last_active = active;
                if active {
                    let source = device.unwrap_or_else(|| "call".into());
                    // Shows up in `npm run app` — the quickest way to tell
                    // "detection is broken" from "the pill is broken".
                    eprintln!("[meetly] microphone went live on: {source}");
                    let _ = app.emit("meeting-detected", MeetingSignal { source });
                } else {
                    eprintln!("[meetly] microphone idle");
                    DISMISSED.store(false, Ordering::SeqCst);
                    // Let the overlay decide whether to hide (it may still be recording).
                    let _ = app.emit("meeting-ended", ());
                }
            }

            // Keep the pill on screen for as long as the mic is live — not just
            // on the rising edge. This covers the mic already being hot when the
            // app launches, and macOS quietly ordering the window out when the
            // user changes Space or an app goes full screen.
            if active && !DISMISSED.load(Ordering::SeqCst) {
                // Hops to the main thread internally — never touch windows from
                // this polling thread.
                crate::overlay::show_if_hidden(&app);
            }

            std::thread::sleep(POLL);
        }
    });
}

#[tauri::command]
pub fn stop_meeting_detection() {
    DETECTING.store(false, Ordering::SeqCst);
    DISMISSED.store(false, Ordering::SeqCst);
}

/// Hide the pill for the rest of this call (the user pressed ✕). It comes back
/// on its own the next time the mic goes idle and then live again.
#[tauri::command]
pub fn dismiss_overlay(app: AppHandle) {
    DISMISSED.store(true, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.hide();
    }
}

/// Exposed so the UI can read the current state on demand.
#[tauri::command]
pub fn microphone_in_use() -> bool {
    mic_in_use()
}

#[derive(serde::Serialize)]
pub struct MicDevice {
    pub name: String,
    pub in_use: bool,
}

/// Every capture device and whether something is currently recording from it.
/// Diagnostic: if the pill doesn't appear during a call, run this while the
/// call is live to see whether CoreAudio reports the device as running.
#[tauri::command]
pub fn mic_debug() -> Vec<MicDevice> {
    #[cfg(target_os = "macos")]
    {
        mac::input_devices()
            .into_iter()
            .map(|d| MicDevice {
                name: mac::device_name(d),
                in_use: mac::is_running_somewhere(d),
            })
            .collect()
    }
    #[cfg(target_os = "windows")]
    {
        // Windows reports usage per *app*, not per device.
        match win::active_input() {
            Some(app) => vec![MicDevice { name: format!("microphone (in use by {app})"), in_use: true }],
            None => vec![MicDevice { name: "microphone".into(), in_use: false }],
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Vec::new()
    }
}

// ── macOS: CoreAudio "is any input device running in any process" ────────────
#[cfg(target_os = "macos")]
mod mac {
    use std::os::raw::c_void;

    pub type OSStatus = i32;
    pub type AudioObjectID = u32;

    #[repr(C)]
    pub struct AudioObjectPropertyAddress {
        pub m_selector: u32,
        pub m_scope: u32,
        pub m_element: u32,
    }

    pub const SYSTEM_OBJECT: AudioObjectID = 1;
    pub const SCOPE_GLOBAL: u32 = 0x676c_6f62; // 'glob'
    pub const SCOPE_INPUT: u32 = 0x696e_7074; // 'inpt'
    pub const DEVICES: u32 = 0x6465_7623; // 'dev#'  kAudioHardwarePropertyDevices
    pub const STREAMS: u32 = 0x7374_6d23; // 'stm#'  kAudioDevicePropertyStreams
    pub const NAME: u32 = 0x6c6e_616d; // 'lnam'  kAudioObjectPropertyName

    /// `kAudioDevicePropertyDeviceIsRunningSomewhere` — "running in at least
    /// one process on the system".
    ///
    /// NOT to be confused with `kAudioDevicePropertyDeviceIsRunning` ('goin'),
    /// which is only true for *this* process's own IO. Using 'goin' here is why
    /// detection only ever fired while Meetly itself was recording.
    pub const RUNNING_SOMEWHERE: u32 = 0x676f_6e65; // 'gone'

    pub const UTF8: u32 = 0x0800_0100; // kCFStringEncodingUTF8

    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        pub fn AudioObjectGetPropertyData(
            in_object: AudioObjectID,
            in_address: *const AudioObjectPropertyAddress,
            in_qualifier_data_size: u32,
            in_qualifier_data: *const c_void,
            io_data_size: *mut u32,
            out_data: *mut c_void,
        ) -> OSStatus;

        pub fn AudioObjectGetPropertyDataSize(
            in_object: AudioObjectID,
            in_address: *const AudioObjectPropertyAddress,
            in_qualifier_data_size: u32,
            in_qualifier_data: *const c_void,
            out_data_size: *mut u32,
        ) -> OSStatus;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        pub fn CFStringGetCString(s: *const c_void, buf: *mut u8, len: isize, enc: u32) -> u8;
        pub fn CFRelease(s: *const c_void);
    }

    fn addr(selector: u32, scope: u32) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress {
            m_selector: selector,
            m_scope: scope,
            m_element: 0,
        }
    }

    /// Read a `UInt32` property, or `None` if the device doesn't answer.
    fn u32_property(device: AudioObjectID, selector: u32) -> Option<u32> {
        unsafe {
            let a = addr(selector, SCOPE_GLOBAL);
            let mut value: u32 = 0;
            let mut size = std::mem::size_of::<u32>() as u32;
            let st = AudioObjectGetPropertyData(
                device,
                &a,
                0,
                std::ptr::null(),
                &mut size,
                &mut value as *mut _ as *mut _,
            );
            (st == 0).then_some(value)
        }
    }

    /// Every audio device on the system that can capture (i.e. has input
    /// streams). Checking only the *default* input misses the common case:
    /// Chrome, Teams or Meet recording from a headset while the system default
    /// is still the built-in mic.
    pub fn input_devices() -> Vec<AudioObjectID> {
        unsafe {
            let a = addr(DEVICES, SCOPE_GLOBAL);
            let mut size = 0u32;
            if AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &a, 0, std::ptr::null(), &mut size) != 0
            {
                return Vec::new();
            }
            let count = size as usize / std::mem::size_of::<AudioObjectID>();
            let mut devices = vec![0 as AudioObjectID; count];
            if AudioObjectGetPropertyData(
                SYSTEM_OBJECT,
                &a,
                0,
                std::ptr::null(),
                &mut size,
                devices.as_mut_ptr() as *mut _,
            ) != 0
            {
                return Vec::new();
            }
            devices.retain(|&d| {
                let sa = addr(STREAMS, SCOPE_INPUT);
                let mut ssize = 0u32;
                AudioObjectGetPropertyDataSize(d, &sa, 0, std::ptr::null(), &mut ssize) == 0
                    && ssize > 0
            });
            devices
        }
    }

    pub fn is_running_somewhere(device: AudioObjectID) -> bool {
        u32_property(device, RUNNING_SOMEWHERE).is_some_and(|v| v != 0)
    }

    pub fn device_name(device: AudioObjectID) -> String {
        let fallback = || format!("input device {device}");
        unsafe {
            let a = addr(NAME, SCOPE_GLOBAL);
            let mut cfstr: *const c_void = std::ptr::null();
            let mut size = std::mem::size_of::<*const c_void>() as u32;
            let st = AudioObjectGetPropertyData(
                device,
                &a,
                0,
                std::ptr::null(),
                &mut size,
                &mut cfstr as *mut _ as *mut _,
            );
            if st != 0 || cfstr.is_null() {
                return fallback();
            }
            let mut buf = [0u8; 256];
            let ok = CFStringGetCString(cfstr, buf.as_mut_ptr(), buf.len() as isize, UTF8);
            CFRelease(cfstr);
            if ok == 0 {
                return fallback();
            }
            let end = buf.iter().position(|&c| c == 0).unwrap_or(0);
            String::from_utf8_lossy(&buf[..end]).to_string()
        }
    }
}

/// Name of the first input device currently capturing in *any* process, or
/// `None` if the mic is idle system-wide.
#[cfg(target_os = "macos")]
fn active_input() -> Option<String> {
    mac::input_devices()
        .into_iter()
        .find(|&d| mac::is_running_somewhere(d))
        .map(mac::device_name)
}

// ── Windows: "is any app holding the microphone right now?" ─────────────────
//
// Windows records mic usage in the CapabilityAccessManager consent store: each
// app that has ever used the mic gets a subkey with `LastUsedTimeStart` and
// `LastUsedTimeStop` (FILETIMEs). While an app *currently* holds the mic, its
// `LastUsedTimeStop` is 0. That is the direct analogue of CoreAudio's
// `kAudioDevicePropertyDeviceIsRunningSomewhere` on macOS, and like it needs no
// extra permission — no COM, no polling of window titles.
#[cfg(target_os = "windows")]
mod win {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const STORE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

    /// A subkey is "live" when it has a start time and no stop time.
    fn is_live(key: &RegKey) -> bool {
        let stop: Option<u64> = key.get_value("LastUsedTimeStop").ok();
        let start: Option<u64> = key.get_value("LastUsedTimeStart").ok();
        matches!((start, stop), (Some(s), Some(0)) if s > 0)
    }

    /// `NonPackaged` entries encode the exe path with `#` for `\`.
    fn pretty(name: &str) -> String {
        name.rsplit(['#', '\\'])
            .next()
            .unwrap_or(name)
            .trim_end_matches(".exe")
            .to_string()
    }

    fn scan(root: winreg::HKEY) -> Option<String> {
        let store = RegKey::predef(root).open_subkey_with_flags(STORE, KEY_READ).ok()?;
        for name in store.enum_keys().flatten() {
            let Ok(app) = store.open_subkey_with_flags(&name, KEY_READ) else {
                continue;
            };
            if name.eq_ignore_ascii_case("NonPackaged") {
                // Desktop apps (Zoom, Teams, Chrome) live one level deeper.
                for exe in app.enum_keys().flatten() {
                    if let Ok(k) = app.open_subkey_with_flags(&exe, KEY_READ) {
                        if is_live(&k) {
                            return Some(pretty(&exe));
                        }
                    }
                }
            } else if is_live(&app) {
                return Some(pretty(&name));
            }
        }
        None
    }

    /// Name of an app currently using the microphone, if any.
    pub fn active_input() -> Option<String> {
        scan(HKEY_CURRENT_USER).or_else(|| scan(HKEY_LOCAL_MACHINE))
    }
}

#[cfg(target_os = "windows")]
fn active_input() -> Option<String> {
    win::active_input()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn active_input() -> Option<String> {
    // Linux would read PulseAudio/PipeWire source-output state; not wired yet.
    None
}

fn mic_in_use() -> bool {
    active_input().is_some()
}
