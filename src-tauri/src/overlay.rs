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

/// `NSWindowStyleMaskNonactivatingPanel` — a panel with this bit set can be
/// clicked without activating (and switching Spaces to) the owning app.
#[cfg(target_os = "macos")]
const NS_NONACTIVATING_PANEL_MASK: usize = 1 << 7;

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
///
/// Callers may be on any thread (the mic poller runs on its own); the AppKit
/// work is hopped onto the main thread — see [`on_main`].
pub fn pin(app: &AppHandle) {
    on_main(app, |app| pin_now(app));
}

/// Turn the overlay's plain `NSWindow` into a non-activating `NSPanel`. Call
/// once at startup, before [`pin`].
///
/// A regular `NSWindow` — even with `canJoinAllSpaces` — is relegated by the
/// window server to its home Space, so over a full-screen app the pill lands
/// back on the desktop Space instead of on the call (exactly the reported bug).
/// A non-activating `NSPanel` is the window type macOS *will* float onto another
/// Space's full screen — it's what Spotlight and every menu-bar overlay use.
///
/// Reclassing the live window to `NSPanel` is safe: `NSPanel` is an `NSWindow`
/// subclass with the same instance layout (adds no ivars), so every Tauri window
/// call keeps working. We also clear `hidesOnDeactivate` — panels default to
/// hiding when their app is not frontmost, which for a background recorder pill
/// would mean "hide during every call".
#[cfg(target_os = "macos")]
pub fn make_panel(app: &AppHandle) {
    on_main(app, |app| {
        let Some(win) = app.get_webview_window("overlay") else {
            return;
        };
        let Ok(ptr) = win.ns_window() else {
            return;
        };
        use objc2::runtime::{AnyClass, AnyObject};
        let ns_window = ptr as *mut AnyObject;
        unsafe {
            let panel_cls: &AnyClass = objc2::class!(NSPanel);
            // Bypass objc2's safe `set_class` wrapper: it debug-asserts the two
            // classes have equal instance size and would panic the dev build if
            // Apple ever pads NSPanel — the raw call is what tauri-nspanel uses.
            objc2::ffi::object_setClass(ns_window, panel_cls as *const AnyClass);

            let mask: usize = objc2::msg_send![ns_window, styleMask];
            let _: () = objc2::msg_send![ns_window, setStyleMask: mask | NS_NONACTIVATING_PANEL_MASK];
            let _: () = objc2::msg_send![ns_window, setHidesOnDeactivate: false];
            let _: () = objc2::msg_send![ns_window, setBecomesKeyOnlyIfNeeded: true];

            eprintln!(
                "[meetly] overlay reclassed to: {}",
                (*ns_window).class().name().to_string_lossy()
            );
        }
    });
}

#[cfg(not(target_os = "macos"))]
pub fn make_panel(_app: &AppHandle) {}

/// Show the pill and make sure it is floating. Use this everywhere instead of
/// a bare `show()`, so the window can never come back un-pinned.
pub fn show(app: &AppHandle) {
    on_main(app, |app| {
        pin_now(app);
        surface_now(app);
    });
}

/// Keep the pill up while the mic is live — called every poll tick.
///
/// It deliberately does no `is_visible()` check: when the user switches Spaces
/// or an app goes full screen, macOS quietly orders the pill off the current
/// Space while still reporting the window as "visible", so trusting that flag
/// is exactly why the pill appeared the first time but never came back over a
/// full-screen call. Re-pinning and re-ordering every tick (both non-activating,
/// so they never steal focus) puts it back on the Space the user is on now.
pub fn show_if_hidden(app: &AppHandle) {
    on_main(app, |app| {
        if app.get_webview_window("overlay").is_none() {
            return;
        }
        pin_now(app);
        surface_now(app);
    });
}

/// Make the pill visible and frontmost on the Space the user is currently on.
///
/// On macOS this is *only* `orderFrontRegardless` — never Tauri's `show()`.
/// `show()` is `makeKeyAndOrderFront`, which activates Meetly and pulls the user
/// out of a full-screen call onto Meetly's own Space (the "pill appears above
/// the main app instead of over full-screen Chrome" bug). `orderFrontRegardless`
/// orders the window in *without* activating the app, so with the
/// `canJoinAllSpaces | fullScreenAuxiliary` behaviour from [`pin_now`] the pill
/// floats over the full-screen call in place.
fn surface_now(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    order_front(app);

    #[cfg(not(target_os = "macos"))]
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.show();
    }
}

/// Exposed to the overlay window so it can re-pin itself after it mounts.
#[tauri::command]
pub fn pin_overlay(app: AppHandle) {
    pin(&app);
}

/// Run window work on the main thread.
///
/// `NSWindow` is main-thread-only. Tauri's own window methods hop threads for
/// us, but the raw `msg_send!` calls in [`pin_now`] do not — sending
/// `setLevel:` from the mic-detection thread is undefined behaviour and killed
/// the app the moment a meeting was detected.
fn on_main(app: &AppHandle, f: impl FnOnce(&AppHandle) + Send + 'static) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || f(&handle));
}

fn pin_now(app: &AppHandle) {
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

/// Bring the pill to the front of its level on the *Space the user is currently
/// looking at*, without activating Meetly or pulling the user out of a
/// full-screen call.
///
/// `orderFrontRegardless` is the key: a plain `show()` orders the window front
/// on Meetly's own Space, so over a full-screen Chrome/Zoom call the pill would
/// either not show or yank the user back to Meetly. `orderFrontRegardless`
/// combined with the `canJoinAllSpaces | fullScreenAuxiliary` collection
/// behaviour set in [`pin_now`] is what makes a background app float a window
/// over another app's full-screen window.
#[cfg(target_os = "macos")]
fn order_front(app: &AppHandle) {
    use objc2::runtime::AnyObject;
    let Some(win) = app.get_webview_window("overlay") else {
        return;
    };
    if let Ok(ptr) = win.ns_window() {
        let ns_window = ptr as *mut AnyObject;
        unsafe {
            let _: () = objc2::msg_send![ns_window, orderFrontRegardless];
        }
    }
}
