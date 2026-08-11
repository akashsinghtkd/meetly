// Thin wrappers around Tauri commands. Guarded so the UI still runs in a plain
// browser (`npm run dev` without Tauri) — useful for fast UI iteration.

import type { AudioDevice, RecordingResult } from "./types";

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function listAudioDevices(): Promise<AudioDevice[]> {
  if (!inTauri()) {
    // Browser fallback: fake devices so Settings renders.
    return [
      { name: "MacBook Pro Microphone", is_default: true, likely_system_audio: false },
      { name: "BlackHole 2ch", is_default: false, likely_system_audio: true },
    ];
  }
  return invoke<AudioDevice[]>("list_audio_devices");
}

export async function startRecording(
  sessionId: string,
  micDevice: string | null,
  systemDevice: string | null,
): Promise<void> {
  if (!inTauri()) return; // no-op in browser
  return invoke("start_recording", {
    sessionId,
    micDevice,
    systemDevice,
  });
}

export async function stopRecording(): Promise<RecordingResult> {
  if (!inTauri()) {
    return { duration_secs: 0, mic_path: null, system_path: null };
  }
  return invoke<RecordingResult>("stop_recording");
}

/**
 * The system-audio source to use when the user hasn't chosen one. Resolved
 * natively so the platform logic lives in one place: a Core Audio process tap
 * on macOS, WASAPI loopback on the default output on Windows. Without this a
 * recording captured only your own voice unless you'd configured a device by
 * hand.
 */
export async function defaultSystemDevice(): Promise<string | null> {
  if (!inTauri()) return null; // browsers cannot capture other apps' audio
  try {
    return await invoke<string | null>("default_system_device");
  } catch {
    return null;
  }
}

export async function isRecording(): Promise<boolean> {
  if (!inTauri()) return false;
  return invoke<boolean>("is_recording");
}

/** Re-assert the floating pill's always-on-top / all-Spaces behaviour. */
export async function pinOverlay(): Promise<void> {
  if (!inTauri()) return;
  try {
    await invoke("pin_overlay");
  } catch {
    /* older build without the command — not fatal */
  }
}

export { inTauri };
