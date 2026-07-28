import { useState } from "react";
import { Plus, Wand2 } from "lucide-react";
import { useStore } from "../store/store";
import type { Meeting, TranscriptSegment } from "../lib/types";

/** Editable speaker chips + add + heuristic auto-split. */
export function SpeakersBar({ meeting }: { meeting: Meeting }) {
  const rename = useStore((s) => s.renameSpeaker);
  const add = useStore((s) => s.addSpeaker);
  const diarize = useStore((s) => s.diarizeSpeakers);
  const hasRemote = meeting.transcript.some((s) => s.channel === "system");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {meeting.speakers.map((sp) => (
        <span
          key={sp.id}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1"
        >
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: sp.color }} />
          <input
            value={sp.displayName}
            onChange={(e) => rename(meeting.id, sp.id, e.target.value)}
            className="bg-transparent outline-none text-sm w-24"
            spellCheck={false}
          />
        </span>
      ))}

      <button
        onClick={() => add(meeting.id)}
        className="flex items-center gap-1 text-sm text-ink-faint hover:text-ink-light px-1"
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </button>

      {hasRemote && (
        <button
          onClick={() => diarize(meeting.id)}
          title="Heuristic: splits the remote channel into multiple speakers by pauses. For accurate acoustic diarization, connect AssemblyAI or Deepgram (Phase 5 full)."
          className="ml-auto flex items-center gap-1 text-xs text-ink-faint hover:text-ink-light border border-line rounded-md px-2 py-1"
        >
          <Wand2 className="h-3.5 w-3.5" /> Auto-split speakers
        </button>
      )}
    </div>
  );
}

/** Clickable speaker label inside a transcript line — lets you reassign a line. */
export function SpeakerSelect({
  meeting,
  segment,
}: {
  meeting: Meeting;
  segment: TranscriptSegment;
}) {
  const setSegmentSpeaker = useStore((s) => s.setSegmentSpeaker);
  const [open, setOpen] = useState(false);
  const sp = meeting.speakers.find((s) => s.id === segment.speakerId);

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-semibold mr-2 hover:underline"
        style={{ color: sp?.color }}
        title="Reassign this line to another speaker"
      >
        {sp?.displayName ?? "Speaker"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 left-0 min-w-[140px] rounded-md border border-line bg-surface shadow-panel py-1">
            {meeting.speakers.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSegmentSpeaker(meeting.id, segment.id, s.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-surface-hover"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.displayName}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
