mod audio;
mod chat;
mod meeting_detect;
mod overlay;
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
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            start_recording,
            stop_recording,
            is_recording,
            transcribe::transcribe_file,
            transcribe::transcribe_deepgram,
            transcribe::diarize_deepgram,
            chat::chat_completion,
            meeting_detect::start_meeting_detection,
            meeting_detect::stop_meeting_detection,
            meeting_detect::microphone_in_use,
            overlay::pin_overlay,
        ])
        .setup(|app| {
            // Make the recorder pill float above other apps from the very first
            // time it is shown, not just above our own windows.
            overlay::pin(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
