//! Keeps the floating recorder pill above *every* app, on every Space.
//!
//! Tauri's `alwaysOnTop` maps to macOS `NSFloatingWindowLevel`, which only
//! floats above ordinary windows on the Space the window was created in — so
//! the pill disappeared the moment the user switched Spaces or put Zoom/Meet
//! into full screen, i.e. exactly when a meeting starts. Raising the level to
//! `NSStatusWindowLevel` and adding
//! `canJoinAllSpaces | stationary | ignoresCycle | fullScreenAuxiliary` makes
//! it follow the user everywhere, including over full-screen calls, without
//! ever taking focus away from the call.

use tauri::{AppHandle, Manager};

/// Above the menu bar and every normal/floating window, below the screen saver.
#[cfg(target_os = "macos")]
const NS_STATUS_WINDOW_LEVEL: isize = 25;

/// `NSWindowCollectionBehavior` bits: show on all Spaces, don't move with them,
/// stay out of Cmd-` cycling, and be allowed to sit over full-screen apps.
#[cfg(target_os = "macos")]
const NS_COLLECTION_BEHAVIOR: usize = (1 << 0)   // CanJoinAllSpaces
    | (1 << 4)                                   // Stationary
    | (1 << 6)                                   // IgnoresCycle
    | (1 << 8); // FullScreenAuxiliary

/// (Re)assert the overlay's floating behaviour. Safe to call as often as we
/// like — macOS resets some of this when a window is shown or re-parented, so
/// we run it at startup, on every `show()`, and when the overlay UI mounts.
pub fn pin(app: &AppHandle) {
    let Some(win) = app.get_webview_window("overlay") else {
        return;
    };
    let _ = win.set_always_on_top(true);
    let _ = win.set_visible_on_all_workspaces(true);

    #[cfg(target_os = "macos")]
    {
        use objc2::runtime::AnyObject;
        if let Ok(ptr) = win.ns_window() {
            let ns_window = ptr as *mut AnyObject;
            unsafe {
                let _: () = objc2::msg_send![ns_window, setLevel: NS_STATUS_WINDOW_LEVEL];
                let _: () =
                    objc2::msg_send![ns_window, setCollectionBehavior: NS_COLLECTION_BEHAVIOR];
            }
        }
    }
}

/// Exposed to the overlay window so it can re-pin itself after it mounts.
#[tauri::command]
pub fn pin_overlay(app: AppHandle) {
    pin(&app);
}
