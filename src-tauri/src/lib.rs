mod audio;
mod calendar;
mod chat;
mod meeting_detect;
mod mic_permission;
mod overlay;
mod system_audio;
mod store_db;
mod transcribe;

use audio::{AudioDevice, Recorder, RecordingResult};
use tauri::{Manager, State};

/// Where recordings live: <app-data>/recordings.
fn recordings_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("recordings"))
}

#[tauri::command]
fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    audio::list_devices()
}

#[tauri::command]
fn start_recording(
    app: tauri::AppHandle,
    recorder: State<'_, Recorder>,
    session_id: String,
    mic_device: Option<String>,
    system_device: Option<String>,
) -> Result<(), String> {
    let dir = recordings_dir(&app)?;
    recorder.start(app.clone(), dir, &session_id, mic_device, system_device)
}

#[tauri::command]
fn stop_recording(recorder: State<'_, Recorder>) -> Result<RecordingResult, String> {
    recorder.stop()
}

/// System-audio source to use when the user hasn't chosen one (platform-specific).
#[tauri::command]
fn default_system_device() -> Option<String> {
    audio::default_system_device()
}

#[tauri::command]
fn is_recording(recorder: State<'_, Recorder>) -> bool {
    recorder.is_recording()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Recorder::default())
        .manage(store_db::Db::default())
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            start_recording,
            stop_recording,
            is_recording,
            default_system_device,
            transcribe::transcribe_file,
            transcribe::transcribe_deepgram,
            transcribe::diarize_deepgram,
            chat::chat_completion,
            meeting_detect::start_meeting_detection,
            meeting_detect::stop_meeting_detection,
            meeting_detect::microphone_in_use,
            meeting_detect::mic_debug,
            meeting_detect::dismiss_overlay,
            mic_permission::mic_authorization,
            mic_permission::request_mic_access,
            calendar::calendar_authorization,
            calendar::request_calendar_access,
            calendar::upcoming_events,
            overlay::pin_overlay,
            store_db::store_get,
            store_db::store_set,
            store_db::store_remove,
        ])
        .setup(|app| {
            // Open the state database before the UI asks for anything.
            if let Err(e) = store_db::init(app.handle()) {
                eprintln!("[meetly] could not open state database: {e}");
            }
            // Convert the pill to a non-activating NSPanel *before* pinning it,
            // so it can float onto another app's full-screen Space instead of
            // being stranded on the desktop Space.
            overlay::make_panel(app.handle());
            // Make the recorder pill float above other apps from the very first
            // time it is shown, not just above our own windows.
            overlay::pin(app.handle());
            // Watch for calls from here on, independent of the UI's lifecycle —
            // the pill must appear the moment any app opens the mic, even before
            // the main window has loaded. Starting it from a React effect made it
            // vulnerable to StrictMode's setup→cleanup→setup, which could leave
            // the poller stopped and no pill would ever show.
            meeting_detect::start_meeting_detection(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
