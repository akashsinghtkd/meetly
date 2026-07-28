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
