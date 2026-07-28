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
    std::thread::spawn(move || {
        let mut last_active = false;
        while DETECTING.load(Ordering::SeqCst) {
            let active = mic_in_use();
            if active != last_active {
                last_active = active;
                if active {
                    let _ = app.emit(
                        "meeting-detected",
                        MeetingSignal { source: "call".into() },
                    );
                    if let Some(w) = app.get_webview_window("overlay") {
                        let _ = w.show();
                        // Re-assert always-on-top / all-Spaces after showing:
                        // macOS drops some of it when a window is ordered in.
                        crate::overlay::pin(&app);
                    }
                } else {
                    // Let the overlay decide whether to hide (it may still be recording).
                    let _ = app.emit("meeting-ended", ());
                }
            }
            std::thread::sleep(Duration::from_secs(3));
        }
    });
}

#[tauri::command]
pub fn stop_meeting_detection() {
    DETECTING.store(false, Ordering::SeqCst);
}

/// Exposed so the UI can read the current state on demand.
#[tauri::command]
pub fn microphone_in_use() -> bool {
    mic_in_use()
}

// ── macOS: CoreAudio "is the input device running somewhere" ─────────────────
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
    pub const DEFAULT_INPUT_DEVICE: u32 = 0x6449_6e20; // 'dIn '
    pub const RUNNING_SOMEWHERE: u32 = 0x676f_696e; // 'goin'

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
    }
}

#[cfg(target_os = "macos")]
fn mic_in_use() -> bool {
    use mac::*;
    use std::mem::size_of;

    unsafe {
        // 1. Resolve the default input device.
        let mut device: AudioObjectID = 0;
        let mut size = size_of::<AudioObjectID>() as u32;
        let addr = AudioObjectPropertyAddress {
            m_selector: DEFAULT_INPUT_DEVICE,
            m_scope: SCOPE_GLOBAL,
            m_element: 0,
        };
        let st = AudioObjectGetPropertyData(
            SYSTEM_OBJECT,
            &addr,
            0,
            std::ptr::null(),
            &mut size,
            &mut device as *mut _ as *mut _,
        );
        if st != 0 || device == 0 {
            return false;
        }

        // 2. Is that device currently running (in use) anywhere on the system?
        let running_addr = AudioObjectPropertyAddress {
            m_selector: RUNNING_SOMEWHERE,
            m_scope: SCOPE_GLOBAL,
            m_element: 0,
        };
        let mut running: u32 = 0;
        let mut rsize = size_of::<u32>() as u32;
        let st2 = AudioObjectGetPropertyData(
            device,
            &running_addr,
            0,
            std::ptr::null(),
            &mut rsize,
            &mut running as *mut _ as *mut _,
        );
        st2 == 0 && running != 0
    }
}

#[cfg(not(target_os = "macos"))]
fn mic_in_use() -> bool {
    // Phase 2: EnumWindows / mic-in-use registry key on Windows.
    false
}
