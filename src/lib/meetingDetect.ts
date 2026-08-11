// Frontend side of Phase-1 meeting detection. Guarded so `npm run dev` in a
// plain browser stays a no-op (the poller + overlay only exist under Tauri).

import { inTauri } from "./tauri";

export async function startMeetingDetection(): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("start_meeting_detection");
}

export async function stopMeetingDetection(): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("stop_meeting_detection");
}

export type MicAuth = "granted" | "denied" | "restricted" | "undetermined" | "unknown";

/** Do we already have microphone access? */
export async function micAuthorization(): Promise<MicAuth> {
  if (!inTauri()) return "unknown";
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<MicAuth>("mic_authorization");
}

/** Raise the pill and trigger the OS mic prompt. Result arrives as an event. */
export async function requestMicAccess(): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("request_mic_access");
}

/** Hide the pill for the rest of the current call. */
export async function dismissOverlay(): Promise<void> {
  if (!inTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("dismiss_overlay");
}
