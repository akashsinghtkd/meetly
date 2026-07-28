import { useEffect } from "react";
import { Circle, Square, Mic, Volume2, Coins } from "lucide-react";
import { useStore } from "../store/store";
import { useSettings } from "../store/settingsStore";
import { formatClock } from "../lib/format";
import { formatUsd } from "../lib/money";
import { getModel, transcriptionCostUsd } from "../lib/providers/catalog";
import { inTauri } from "../lib/tauri";

/** Floating recording control, shown while a meeting is being captured. */
export function RecordBar() {
  const recording = useStore((s) => s.recording);
  const stopMeeting = useStore((s) => s.stopMeeting);
  const tickElapsed = useStore((s) => s.tickElapsed);
  const systemDevice = useStore((s) => s.systemDevice);
  const { transcriptionProvider, transcriptionModel } = useSettings();

  // Live projected transcription cost. Two channels (mic+system) when a system
  // device is selected, so audio-minutes accrue on both.
  const model = getModel(transcriptionProvider, transcriptionModel);
  const channels = systemDevice ? 2 : 1;
  const estCost = model
    ? transcriptionCostUsd(model.pricing, recording.elapsedSecs * channels)
    : 0;

  useEffect(() => {
    if (!recording.active) return;
    const id = setInterval(() => tickElapsed(), 1000);
    return () => clearInterval(id);
  }, [recording.active, tickElapsed]);

  if (!recording.active) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 rounded-full bg-chip text-chip-fg pl-4 pr-2 py-2 shadow-panel">
        <Circle className="h-3 w-3 fill-red-500 text-red-500 recording-dot" />
        <span className="font-medium tabular-nums text-sm w-14 text-center">
          {formatClock(recording.elapsedSecs)}
        </span>

        <div className="flex items-center gap-2 text-white/70 text-xs">
          <span className="flex items-center gap-1">
            <Mic className="h-3.5 w-3.5" /> Mic
          </span>
          <span className="flex items-center gap-1">
            <Volume2 className="h-3.5 w-3.5" />
            {systemDevice ? "System" : "—"}
          </span>
        </div>

        <span
          className="flex items-center gap-1 text-xs text-white/80 tabular-nums border-l border-white/15 pl-3"
          title="Projected transcription cost so far"
        >
          <Coins className="h-3.5 w-3.5" />
          ~{formatUsd(estCost)}
        </span>

        <button
          onClick={() => stopMeeting()}
          className="flex items-center gap-1.5 rounded-full bg-white text-neutral-900 px-3 py-1.5 text-sm font-medium hover:bg-white/90 transition-colors"
        >
          <Square className="h-3.5 w-3.5 fill-current" /> Stop
        </button>
      </div>
      {!inTauri() && (
        <div className="mt-2 text-center text-[11px] text-ink-faint">
          Browser preview — audio capture runs only in the desktop app
        </div>
      )}
    </div>
  );
}
