// Two-tone notepad enrichment. You type rough notes; the AI expands them into
// clean prose grounded in the transcript. The result is shown in muted text so
// it always reads as "AI added this", Granola-style.

import { useSettings } from "../../store/settingsStore";
import { budgetStatus } from "../budget";
import { teamAiAllowed, teamAiBlockMessage } from "../billing/limits";
import { inTauri } from "../tauri";
import { chatCompletion } from "./chat";
import type { Meeting } from "../types";

export interface NotesResult {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  estimated: boolean;
}

const SYSTEM_PROMPT =
  "You are Meetly's note-taking assistant. The user jotted rough notes during a " +
  "meeting. Rewrite and expand them into clear, well-structured notes using ONLY " +
  "facts supported by the transcript. Keep the user's intent and ordering. Use " +
  "short markdown bullets and bold sub-headers where helpful. Do not invent details; " +
  "if the notes reference something absent from the transcript, keep it but don't embellish.";

function transcriptExcerpt(meeting: Meeting, limit = 60): string {
  return meeting.transcript
    .slice(0, limit)
    .map((s) => {
      const who = meeting.speakers.find((sp) => sp.id === s.speakerId)?.displayName ?? "Speaker";
      return `${who}: ${s.text}`;
    })
    .join("\n");
}

async function realEnhance(meeting: Meeting, rawNotes: string, apiKey: string): Promise<NotesResult> {
  const { chatModel } = useSettings.getState();
  const user =
    `Meeting: ${meeting.title}\n\n` +
    `My rough notes:\n${rawNotes}\n\n---\nTranscript:\n${transcriptExcerpt(meeting)}`;
  const out = await chatCompletion(chatModel, apiKey, SYSTEM_PROMPT, user, false);
  return {
    text: out.content.trim(),
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    estimated: false,
  };
}

/** Deterministic local enrichment when there's no API key — still useful. */
function mockEnhance(meeting: Meeting, rawNotes: string): NotesResult {
  const lines = rawNotes
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const bullets = lines.map((l) => {
    // Find a transcript line that mentions a word from this note for a "citation".
    const terms = l.toLowerCase().split(/\W+/).filter((t) => t.length > 4);
    const hit = meeting.transcript.find((s) =>
      terms.some((t) => s.text.toLowerCase().includes(t)),
    );
    const cite = hit ? `  \n  ↳ *from the call:* “${hit.text.slice(0, 120)}”` : "";
    return `- **${l.replace(/[:.]$/, "")}**${cite}`;
  });

  const header = meeting.summary?.executive
    ? `${meeting.summary.executive}\n\n`
    : "";

  return {
    text:
      header +
      (bullets.length
        ? bullets.join("\n")
        : "_Add a few rough notes above, then enhance to expand them against the transcript._"),
    estimated: true,
  };
}

export async function enhanceNotes(meeting: Meeting, rawNotes: string): Promise<NotesResult> {
  const { chatProvider, apiKeys } = useSettings.getState();
  const key = apiKeys[chatProvider]?.trim();
  if (inTauri() && chatProvider === "openai" && key) {
    if (budgetStatus().blocked) {
      return { text: "Monthly budget reached — raise the cap in Settings to enhance notes.", estimated: true };
    }
    if (!teamAiAllowed()) {
      return { text: teamAiBlockMessage(), estimated: true };
    }
    return realEnhance(meeting, rawNotes, key);
  }
  return mockEnhance(meeting, rawNotes);
}
