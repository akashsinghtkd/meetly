// Acoustic diarization over a full-session recording. Uses Deepgram (real voice
// separation) via Rust. Returns speaker-labeled, timestamped turns.

import { useSettings } from "../../store/settingsStore";
import { inTauri } from "../tauri";

export interface DiarSegment {
  speaker: number;
  tStart: number;
  tEnd: number;
  text: string;
}

export interface DiarizeOutput {
  segments: DiarSegment[];
}

/** True when real acoustic diarization is available (Deepgram key present). */
export function canDiarize(): boolean {
  const key = useSettings.getState().apiKeys["deepgram"]?.trim();
  return inTauri() && Boolean(key);
}

/** Diarize one audio file. `model` defaults to Deepgram nova-3. */
export async function diarizeFile(path: string, model = "nova-3"): Promise<DiarizeOutput> {
  const key = useSettings.getState().apiKeys["deepgram"]?.trim();
  if (!key) throw new Error("Deepgram API key required for diarization");
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<{
    segments: { speaker: number; t_start: number; t_end: number; text: string }[];
  }>("diarize_deepgram", { path, model, apiKey: key });
  return {
    segments: res.segments.map((s) => ({
      speaker: s.speaker,
      tStart: s.t_start,
      tEnd: s.t_end,
      text: s.text,
    })),
  };
}
