import type { Meeting } from "./types";
import { formatDuration, relativeDate } from "./format";

/** Serialize a meeting into a clean, paste-anywhere Markdown summary. */
export function meetingToMarkdown(meeting: Meeting): string {
  const out: string[] = [];
  out.push(`# ${meeting.title || "Untitled meeting"}`);

  const meta: string[] = [relativeDate(meeting.startedAt)];
  if (meeting.durationSecs) meta.push(formatDuration(meeting.durationSecs));
  if (meeting.participants.length) meta.push(meeting.participants.join(", "));
  out.push(`_${meta.join(" · ")}_`);

  if (meeting.summary?.executive) {
    out.push("\n## Summary", meeting.summary.executive);
  }
  if (meeting.summary?.decisions?.length) {
    out.push("\n## Decisions", ...meeting.summary.decisions.map((d) => `- ${d}`));
  }
  if (meeting.actionItems.length) {
    out.push(
      "\n## Action items",
      ...meeting.actionItems.map((a) => {
        const box = a.status === "done" ? "[x]" : "[ ]";
        const owner = a.owner ? ` — _${a.owner}_` : "";
        const due = a.due ? ` (due ${a.due})` : "";
        return `- ${box} ${a.task}${owner}${due}`;
      }),
    );
  }
  if (meeting.summary?.risks?.length) {
    out.push("\n## Risks", ...meeting.summary.risks.map((r) => `- ${r}`));
  }
  if (meeting.summary?.openQuestions?.length) {
    out.push("\n## Open questions", ...meeting.summary.openQuestions.map((q) => `- ${q}`));
  }
  if (meeting.notes?.trim()) {
    out.push("\n## Notes", meeting.notes.trim());
  }
  if (meeting.notesEnhanced?.trim()) {
    out.push("\n## AI notes", meeting.notesEnhanced.trim());
  }

  return out.join("\n");
}

/** Copy text to the clipboard; resolves false if the API is unavailable. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A link that opens the web app straight to this meeting (honors teamspace RLS). */
export function meetingShareLink(meetingId: string): string {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("meeting", meetingId);
    u.searchParams.delete("invite");
    return u.toString();
  } catch {
    return `?meeting=${meetingId}`;
  }
}
