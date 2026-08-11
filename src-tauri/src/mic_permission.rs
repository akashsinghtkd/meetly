//! Microphone authorization (macOS TCC).
//!
//! Two jobs: report whether we already have mic access, and trigger the system
//! prompt on demand. The pill is raised *before* the prompt appears so the user
//! can see who is asking — a bare "Meetly would like to access the microphone"
//! sheet with no visible app behind it reads as a scam.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum MicAuth {
    Granted,
    Denied,
    Restricted,
    /// Never asked — this is the case where we want the pill on screen.
    Undetermined,
    /// Platform doesn't gate the mic, or AVFoundation wasn't reachable.
    Unknown,
}

#[tauri::command]
pub fn mic_authorization() -> MicAuth {
    status()
}

/// Show the pill, then ask macOS for mic access. The answer comes back as a
/// `mic-permission-result` event (boolean payload) — the prompt is async and
/// the user may sit on it for a while.
#[tauri::command]
pub fn request_mic_access(app: AppHandle) {
    crate::overlay::show(&app);
    request(move |granted| {
        let _ = app.emit("mic-permission-result", granted);
    });
}

#[cfg(target_os = "macos")]
pub fn status() -> MicAuth {
    match mac::authorization_status() {
        0 => MicAuth::Undetermined,
        1 => MicAuth::Restricted,
        2 => MicAuth::Denied,
        3 => MicAuth::Granted,
        _ => MicAuth::Unknown,
    }
}

#[cfg(target_os = "macos")]
fn request(done: impl Fn(bool) + Send + Sync + 'static) {
    mac::request_access(done);
}

#[cfg(not(target_os = "macos"))]
pub fn status() -> MicAuth {
    MicAuth::Unknown
}

#[cfg(not(target_os = "macos"))]
fn request(done: impl Fn(bool) + Send + Sync + 'static) {
    done(true);
}

#[cfg(target_os = "macos")]
mod mac {
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject, Bool};

    // AVCaptureDevice lives in AVFoundation; force the framework to be linked
    // so `AnyClass::get` can actually find it at runtime.
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}

    /// `AVMediaTypeAudio` is just the string constant `"soun"`. Building it
    /// ourselves avoids having to import the extern NSString symbol.
    unsafe fn media_type_audio() -> *mut AnyObject {
        let cls = AnyClass::get(c"NSString").expect("NSString is always present");
        unsafe { msg_send![cls, stringWithUTF8String: c"soun".as_ptr()] }
    }

    /// Raw `AVAuthorizationStatus`, or -1 if AVFoundation is unavailable.
    pub fn authorization_status() -> i64 {
        unsafe {
            let Some(cls) = AnyClass::get(c"AVCaptureDevice") else {
                return -1;
            };
            let media_type = media_type_audio();
            msg_send![cls, authorizationStatusForMediaType: media_type]
        }
    }

    pub fn request_access(done: impl Fn(bool) + Send + Sync + 'static) {
        unsafe {
            let Some(cls) = AnyClass::get(c"AVCaptureDevice") else {
                done(false);
                return;
            };
            let media_type = media_type_audio();
            // AVFoundation copies the block, so it outlives this scope. The
            // handler runs on an arbitrary queue — hence the Send + Sync bound.
            let handler = RcBlock::new(move |granted: Bool| done(granted.as_bool()));
            let _: () = msg_send![
                cls,
                requestAccessForMediaType: media_type,
                completionHandler: &*handler,
            ];
        }
    }
}
