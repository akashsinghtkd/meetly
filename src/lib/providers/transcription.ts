// Transcription provider abstraction. New providers implement `Transcriber`;
// the OpenAI one delegates the HTTP call to Rust (avoids CORS + keeps the key
// out of the webview). A mock provider keeps the whole flow demoable with no key.

import { useSettings } from "../../store/settingsStore";
import { inTauri } from "../tauri";

export interface ChunkContext {
  meetingId: string;
  channel: "mic" | "system";
  index: number;
  offsetSecs: number;
  audioSeconds: number;
}

export interface TranscribedSegment {
  tStart: number;
  tEnd: number;
  text: string;
}

export interface TranscriptionOutput {
  segments: TranscribedSegment[];
  inputTokens?: number;
  outputTokens?: number;
  /** true when no real API call happened (mock) */
  estimated: boolean;
}

export interface Transcriber {
  providerId: string;
  modelId: string;
  transcribeChunk(path: string | null, ctx: ChunkContext): Promise<TranscriptionOutput>;
}

interface RustTranscribeResult {
  text: string;
  segments: { t_start: number; t_end: number; text: string }[];
  input_tokens: number | null;
  output_tokens: number | null;
}

class RustTranscriber implements Transcriber {
  constructor(
    public providerId: string,
    public modelId: string,
    private apiKey: string,
    private command: "transcribe_file" | "transcribe_deepgram",
  ) {}

  async transcribeChunk(path: string | null, ctx: ChunkContext): Promise<TranscriptionOutput> {
    if (!path) throw new Error("transcription requires an audio file path");
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<RustTranscribeResult>(this.command, {
      path,
      model: this.modelId,
      apiKey: this.apiKey,
    });

    let segments: TranscribedSegment[];
    if (res.segments.length > 0) {
      segments = res.segments.map((s) => ({
        tStart: ctx.offsetSecs + s.t_start,
        tEnd: ctx.offsetSecs + s.t_end,
        text: s.text.trim(),
      }));
    } else if (res.text.trim()) {
      // Models without segment timestamps (gpt-4o-transcribe) return plain text.
      segments = [
        { tStart: ctx.offsetSecs, tEnd: ctx.offsetSecs + ctx.audioSeconds, text: res.text.trim() },
      ];
    } else {
      segments = [];
    }

    return {
      segments,
      inputTokens: res.input_tokens ?? undefined,
      outputTokens: res.output_tokens ?? undefined,
      estimated: false,
    };
  }
}

const MOCK_LINES = [
  "Okay, let's get started — thanks everyone for joining.",
  "I think the main thing we need to decide today is the timeline.",
  "Right, and the blocker there is still the API work.",
  "Let's aim to have that wrapped by end of week.",
  "Can you own the follow-up on that?",
  "Sounds good, I'll send a recap after the call.",
];

/** Deterministic stand-in so the live-transcript UX works with no API key. */
class MockTranscriber implements Transcriber {
  providerId = "mock";
  constructor(public modelId: string) {}

  async transcribeChunk(_path: string | null, ctx: ChunkContext): Promise<TranscriptionOutput> {
    const text = MOCK_LINES[ctx.index % MOCK_LINES.length];
    return {
      segments: [{ tStart: ctx.offsetSecs, tEnd: ctx.offsetSecs + ctx.audioSeconds, text }],
      estimated: true,
    };
  }
}

/** Resolve the active transcriber from settings. Falls back to mock. */
export function getTranscriber(): Transcriber {
  const { transcriptionProvider, transcriptionModel, apiKeys } = useSettings.getState();
  const key = apiKeys[transcriptionProvider]?.trim();

  if (inTauri() && key) {
    if (transcriptionProvider === "openai") {
      return new RustTranscriber("openai", transcriptionModel, key, "transcribe_file");
    }
    if (transcriptionProvider === "deepgram") {
      return new RustTranscriber("deepgram", transcriptionModel, key, "transcribe_deepgram");
    }
  }
  // Unwired provider or no key → mock.
  return new MockTranscriber(transcriptionModel);
}
