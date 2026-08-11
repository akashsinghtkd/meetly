//! Audio capture for Meetly.
//!
//! Records the microphone and (optionally) a system-audio loopback device. Two
//! things are written per source:
//!   * rolling short WAV **chunks** → fire a `transcribe-chunk` event so the UI
//!     can show a live transcript while the meeting is going.
//!   * one continuous **full-session** WAV → kept for an accurate, diarized
//!     re-transcription pass after the meeting (see PLAN.md §5 / transcribe.rs).
//!
//! Mic and system audio stay separate (channel = "mic" / "system"), giving a
//! reliable "Me" vs "Them" split; acoustic diarization then separates multiple
//! remote voices within the system channel.

use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const CHUNK_SECS: f64 = 8.0;

type WavWriter = hound::WavWriter<BufWriter<File>>;

/// Both writers for one capture source. The audio callback writes every sample
/// to both; only `chunk` is rotated.
pub struct Sink {
    pub chunk: Option<WavWriter>,
    pub full: Option<WavWriter>,
}
pub type SharedSink = Arc<Mutex<Sink>>;

#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
    pub likely_system_audio: bool,
    /// Output device captured in loopback mode (Windows WASAPI) — zero-install
    /// system audio.
    pub is_loopback: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkEvent {
    pub meeting_id: String,
    pub channel: String,
    pub path: String,
    pub index: usize,
    pub offset_secs: f64,
    pub audio_seconds: f64,
}

struct Track {
    stop: Arc<AtomicBool>,
    handle: JoinHandle<()>,
    full_path: PathBuf,
}

pub struct Recording {
    mic: Option<Track>,
    system: Option<Track>,
    started_at: Instant,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecordingResult {
    pub duration_secs: f64,
    /// Full-session recordings for the accurate re-transcription pass.
    pub mic_path: Option<String>,
    pub system_path: Option<String>,
}

#[derive(Default)]
pub struct Recorder {
    current: Mutex<Option<Recording>>,
}

fn name_hints_loopback(name: &str) -> bool {
    let n = name.to_lowercase();
    ["blackhole", "loopback", "aggregate", "soundflower", "vb-audio", "monitor"]
        .iter()
        .any(|k| n.contains(k))
}

/// Suffix that marks an output device to be captured in loopback mode.
const LOOPBACK_SUFFIX: &str = " (loopback)";

pub fn list_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());
    let mut out = Vec::new();

    for device in host.input_devices().map_err(|e| e.to_string())? {
        let name = match device.name() {
            Ok(n) => n,
            Err(_) => continue,
        };
        let is_default = default_name.as_deref() == Some(name.as_str());
        out.push(AudioDevice {
            likely_system_audio: name_hints_loopback(&name),
            is_default,
            is_loopback: false,
            name,
        });
    }

    // macOS 14.2+ can tap the system mix directly — no BlackHole required.
    #[cfg(target_os = "macos")]
    if crate::system_audio::is_supported() {
        out.insert(
            0,
            AudioDevice {
                name: crate::system_audio::DEVICE_LABEL.to_string(),
                is_default: false,
                likely_system_audio: true,
                is_loopback: true,
            },
        );
    }

    // On Windows, output devices can be captured in loopback mode — this gives
    // zero-install system-audio capture (no virtual device needed).
    #[cfg(target_os = "windows")]
    {
        if let Ok(outputs) = host.output_devices() {
            for device in outputs {
                if let Ok(name) = device.name() {
                    out.push(AudioDevice {
                        name: format!("{name}{LOOPBACK_SUFFIX}"),
                        is_default: false,
                        likely_system_audio: true,
                        is_loopback: true,
                    });
                }
            }
        }
    }

    Ok(out)
}

/// The system-audio source to use when the user hasn't picked one.
///
/// Both desktop platforms can capture the far side of a call with nothing to
/// install — macOS through a Core Audio process tap, Windows through WASAPI
/// loopback on the default output (cpal sets `AUDCLNT_STREAMFLAGS_LOOPBACK`
/// automatically when you open an input stream on a render device). Neither was
/// being used by default, so recordings captured only this side of the call.
pub fn default_system_device() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        if crate::system_audio::is_supported() {
            return Some(crate::system_audio::DEVICE_LABEL.to_string());
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(device) = cpal::default_host().default_output_device() {
            if let Ok(name) = device.name() {
                return Some(format!("{name}{LOOPBACK_SUFFIX}"));
            }
        }
    }

    None
}

/// Resolve the device + config to capture. A name ending in `LOOPBACK_SUFFIX`
/// refers to an output device captured in loopback (WASAPI); otherwise it's a
/// normal input device. `None` = default input (the microphone).
fn resolve_capture(
    name: Option<String>,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig), String> {
    let host = cpal::default_host();
    match name {
        None => {
            let d = host
                .default_input_device()
                .ok_or("no default input device")?;
            let cfg = d.default_input_config().map_err(|e| e.to_string())?;
            Ok((d, cfg))
        }
        Some(n) => {
            if let Some(base) = n.strip_suffix(LOOPBACK_SUFFIX) {
                let d = host
                    .output_devices()
                    .map_err(|e| e.to_string())?
                    .find(|d| d.name().map(|x| x == base).unwrap_or(false))
                    .ok_or_else(|| format!("output device not found: {base}"))?;
                // Loopback captures the render endpoint's own format.
                let cfg = d.default_output_config().map_err(|e| e.to_string())?;
                Ok((d, cfg))
            } else {
                let d = host
                    .input_devices()
                    .map_err(|e| e.to_string())?
                    .find(|d| d.name().map(|x| x == n).unwrap_or(false))
                    .ok_or_else(|| format!("audio device not found: {n}"))?;
                let cfg = d.default_input_config().map_err(|e| e.to_string())?;
                Ok((d, cfg))
            }
        }
    }
}

fn new_wav(path: &PathBuf, spec: hound::WavSpec) -> Result<WavWriter, String> {
    hound::WavWriter::create(path, spec).map_err(|e| e.to_string())
}

/// Where a track's audio comes from. Resolved before the capture thread starts
/// so failures surface to the UI immediately instead of dying in a thread.
enum Capture {
    Cpal(cpal::Device, cpal::StreamConfig, SampleFormat),
    /// macOS process tap — system audio with nothing to install.
    #[cfg(target_os = "macos")]
    SystemTap(crate::system_audio::SystemAudioTap),
}

/// Kept alive for the lifetime of the capture thread; dropping stops capture.
/// The variants are never read — holding them *is* the point.
#[allow(dead_code)]
enum LiveCapture {
    Cpal(cpal::Stream),
    #[cfg(target_os = "macos")]
    SystemTap(crate::system_audio::SystemAudioTap),
}

fn start_track(
    app: AppHandle,
    meeting_id: String,
    channel: &'static str,
    device_name: Option<String>,
    dir: PathBuf,
) -> Result<Track, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();

    #[cfg(target_os = "macos")]
    let use_tap = device_name.as_deref() == Some(crate::system_audio::DEVICE_LABEL);
    #[cfg(not(target_os = "macos"))]
    let use_tap = false;

    let (capture, spec) = if use_tap {
        #[cfg(target_os = "macos")]
        {
            let tap = crate::system_audio::SystemAudioTap::open()?;
            let fmt = tap.format()?;
            (
                Capture::SystemTap(tap),
                hound::WavSpec {
                    channels: fmt.channels,
                    sample_rate: fmt.sample_rate,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                },
            )
        }
        #[cfg(not(target_os = "macos"))]
        unreachable!()
    } else {
        let (device, supported) = resolve_capture(device_name.clone())?;
        let sample_format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let spec = hound::WavSpec {
            channels: config.channels,
            sample_rate: config.sample_rate.0,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        (Capture::Cpal(device, config, sample_format), spec)
    };

    let got_audio = Arc::new(AtomicBool::new(false));
    let got_audio_thread = got_audio.clone();

    let full_path = dir.join(format!("{meeting_id}-{channel}-full.wav"));
    // Validate we can create the full-session file up front (fail fast to UI).
    let full_writer = new_wav(&full_path, spec)?;
    let full_path_ret = full_path.clone();

    let handle = std::thread::spawn(move || {
        let mut index = 0usize;
        let mut chunk_path = dir.join(format!("{meeting_id}-{channel}-{index:04}.wav"));
        let chunk_writer = match new_wav(&chunk_path, spec) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[audio] create chunk failed: {e}");
                return;
            }
        };
        let sink: SharedSink = Arc::new(Mutex::new(Sink {
            chunk: Some(chunk_writer),
            full: Some(full_writer),
        }));

        // Bound to a local so capture stays alive until this thread ends.
        let _live = match capture {
            Capture::Cpal(device, config, sample_format) => {
                let stream = match build_stream(&device, &config, sample_format, sink.clone()) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("[audio] build stream failed: {e}");
                        return;
                    }
                };
                if let Err(e) = stream.play() {
                    eprintln!("[audio] stream play failed: {e}");
                    return;
                }
                LiveCapture::Cpal(stream)
            }
            #[cfg(target_os = "macos")]
            Capture::SystemTap(mut tap) => {
                if let Err(e) = tap.start(sink.clone(), got_audio_thread.clone()) {
                    eprintln!("[audio] system tap failed: {e}");
                    return;
                }
                LiveCapture::SystemTap(tap)
            }
        };

        let mut chunk_start = Instant::now();
        let emit = |index: usize, path: &PathBuf, elapsed: f64| {
            let _ = app.emit(
                "transcribe-chunk",
                ChunkEvent {
                    meeting_id: meeting_id.clone(),
                    channel: channel.to_string(),
                    path: path.to_string_lossy().into_owned(),
                    index,
                    offset_secs: index as f64 * CHUNK_SECS,
                    audio_seconds: elapsed,
                },
            );
        };

        loop {
            std::thread::sleep(std::time::Duration::from_millis(100));
            let stopping = stop_thread.load(Ordering::Relaxed);
            let elapsed = chunk_start.elapsed().as_secs_f64();

            if stopping {
                let old = {
                    let mut s = sink.lock().unwrap();
                    let old = s.chunk.take();
                    if let Some(f) = s.full.take() {
                        let _ = f.finalize();
                    }
                    old
                };
                if let Some(o) = old {
                    let _ = o.finalize();
                    emit(index, &chunk_path, elapsed);
                }
                if !got_audio_thread.load(Ordering::Relaxed) && channel == "system" {
                    eprintln!("[audio] the system-audio track received no samples");
                }
                break;
            }

            if elapsed >= CHUNK_SECS {
                let next_path = dir.join(format!("{meeting_id}-{channel}-{:04}.wav", index + 1));
                match new_wav(&next_path, spec) {
                    Ok(w) => {
                        let old = {
                            let mut s = sink.lock().unwrap();
                            let old = s.chunk.take();
                            s.chunk = Some(w);
                            old
                        };
                        if let Some(o) = old {
                            let _ = o.finalize();
                            emit(index, &chunk_path, elapsed);
                        }
                        index += 1;
                        chunk_path = next_path;
                        chunk_start = Instant::now();
                    }
                    Err(e) => {
                        eprintln!("[audio] rotate failed: {e}");
                        chunk_start = Instant::now();
                    }
                }
            }
        }
    });

    Ok(Track {
        stop,
        handle,
        full_path: full_path_ret,
    })
}

fn build_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    format: SampleFormat,
    sink: SharedSink,
) -> Result<cpal::Stream, String> {
    let err_fn = |e| eprintln!("[audio] stream error: {e}");

    fn write_all(sink: &SharedSink, samples: impl Iterator<Item = i16>) {
        let mut s = sink.lock().unwrap();
        for v in samples {
            if let Some(w) = s.chunk.as_mut() {
                let _ = w.write_sample(v);
            }
            if let Some(w) = s.full.as_mut() {
                let _ = w.write_sample(v);
            }
        }
    }

    let stream = match format {
        SampleFormat::F32 => {
            let sink = sink.clone();
            device.build_input_stream(
                config,
                move |data: &[f32], _: &_| {
                    write_all(&sink, data.iter().map(|&x| (x.clamp(-1.0, 1.0) * i16::MAX as f32) as i16));
                },
                err_fn,
                None,
            )
        }
        SampleFormat::I16 => {
            let sink = sink.clone();
            device.build_input_stream(
                config,
                move |data: &[i16], _: &_| write_all(&sink, data.iter().copied()),
                err_fn,
                None,
            )
        }
        SampleFormat::U16 => {
            let sink = sink.clone();
            device.build_input_stream(
                config,
                move |data: &[u16], _: &_| {
                    write_all(&sink, data.iter().map(|&x| (x as i32 - 32768) as i16));
                },
                err_fn,
                None,
            )
        }
        other => return Err(format!("unsupported sample format: {other:?}")),
    };
    stream.map_err(|e| e.to_string())
}

impl Recorder {
    pub fn start(
        &self,
        app: AppHandle,
        dir: PathBuf,
        meeting_id: &str,
        mic_device: Option<String>,
        system_device: Option<String>,
    ) -> Result<(), String> {
        let mut guard = self.current.lock().unwrap();
        if guard.is_some() {
            return Err("a recording is already in progress".into());
        }
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        let mic = start_track(app.clone(), meeting_id.to_string(), "mic", mic_device, dir.clone())?;
        let system = match system_device {
            Some(name) => Some(start_track(app.clone(), meeting_id.to_string(), "system", Some(name), dir.clone())?),
            None => None,
        };

        *guard = Some(Recording {
            mic: Some(mic),
            system,
            started_at: Instant::now(),
        });
        Ok(())
    }

    pub fn stop(&self) -> Result<RecordingResult, String> {
        let recording = self
            .current
            .lock()
            .unwrap()
            .take()
            .ok_or("no recording in progress")?;

        let duration_secs = recording.started_at.elapsed().as_secs_f64();
        let stop_track = |t: Track| -> String {
            t.stop.store(true, Ordering::Relaxed);
            let _ = t.handle.join();
            t.full_path.to_string_lossy().into_owned()
        };

        let mic_path = recording.mic.map(stop_track);
        let system_path = recording.system.map(stop_track);

        Ok(RecordingResult {
            duration_secs,
            mic_path,
            system_path,
        })
    }

    pub fn is_recording(&self) -> bool {
        self.current.lock().unwrap().is_some()
    }
}
