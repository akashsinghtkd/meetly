// Drives live transcription for an active meeting.
//
// In the desktop app: subscribes to the Rust `transcribe-chunk` event and
// transcribes each finalized audio chunk as it lands.
// In the browser (no Tauri): runs a timer that feeds the mock transcriber so the
// live-transcript UX is still demoable.
//
// Every chunk transcription is logged to the cost ledger.

import { useStore } from "../store/store";
import { useCost } from "../store/costStore";
import { useSettings } from "../store/settingsStore";
import { getModel, transcriptionCostUsd } from "./providers/catalog";
import { getTranscriber, type ChunkContext, type Transcriber } from "./providers/transcription";
import { budgetStatus } from "./budget";
import { teamAiAllowed } from "./billing/limits";
import { inTauri } from "./tauri";

const CHUNK_SECS = 8;

interface Session {
  meetingId: string;
  transcriber: Transcriber;
  cleanup: () => void;
}

let active: Session | null = null;

async function handleChunk(meetingId: string, transcriber: Transcriber, ctx: ChunkContext, path: string | null) {
  const settings = useSettings.getState();
  // Hard budget cap: stop making paid transcription calls mid-meeting.
  if (budgetStatus().blocked) return;
  if (!teamAiAllowed()) return;
  try {
    const out = await transcriber.transcribeChunk(path, ctx);

    const speakerId = ctx.channel === "mic" ? "me" : "them";
    for (const seg of out.segments) {
      if (!seg.text) continue;
      useStore.getState().addSegment(meetingId, {
        speakerId,
        channel: ctx.channel,
        tStart: seg.tStart,
        tEnd: seg.tEnd,
        text: seg.text,
      });
    }

    // Record cost from the selected model's pricing × audio duration.
    const model = getModel(settings.transcriptionProvider, settings.transcriptionModel);
    const costUsd = model ? transcriptionCostUsd(model.pricing, ctx.audioSeconds) : 0;
    useCost.getState().add({
      provider: settings.transcriptionProvider,
      model: settings.transcriptionModel,
      kind: "transcription",
      meetingId,
      audioSeconds: ctx.audioSeconds,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      costUsd,
      estimated: out.estimated,
    });
  } catch (e) {
    console.error("[live] chunk transcription failed:", e);
    useStore.getState().setMeetingError(meetingId, String(e));
  }
}

export async function startLiveSession(meetingId: string) {
  stopLiveSession(); // ensure only one
  const transcriber = getTranscriber();

  if (inTauri()) {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<{
      meetingId: string;
      channel: "mic" | "system";
      path: string;
      index: number;
      offsetSecs: number;
      audioSeconds: number;
    }>("transcribe-chunk", (event) => {
      const p = event.payload;
      if (p.meetingId !== meetingId) return;
      handleChunk(
        meetingId,
        transcriber,
        {
          meetingId,
          channel: p.channel,
          index: p.index,
          offsetSecs: p.offsetSecs,
          audioSeconds: p.audioSeconds,
        },
        p.path,
      );
    });
    active = { meetingId, transcriber, cleanup: () => unlisten() };
  } else {
    // Browser demo: alternate speakers on a timer using the mock transcriber.
    let index = 0;
    const timer = setInterval(() => {
      const channel = index % 2 === 0 ? "mic" : "system";
      handleChunk(
        meetingId,
        transcriber,
        {
          meetingId,
          channel,
          index,
          offsetSecs: index * CHUNK_SECS,
          audioSeconds: CHUNK_SECS,
        },
        null,
      );
      index += 1;
    }, CHUNK_SECS * 1000);
    active = { meetingId, transcriber, cleanup: () => clearInterval(timer) };
  }
}

export function stopLiveSession() {
  if (active) {
    active.cleanup();
    active = null;
  }
}
