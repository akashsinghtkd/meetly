// Composes a follow-up email from a meeting's AI notes. Deterministic — it
// assembles the summary + action items (grouped by owner) that the LLM already
// produced, addressed to the calendar invitees. It never sends: the UI hands the
// draft to the user's mail client (or clipboard) so they review and send.

import type { ActionItem, Meeting } from "./types";

export interface EmailDraft {
  to: string[];
  subject: string;
  body: string;
}

/** "sarah.lee@x.com" → "Sarah"; "Sarah Lee" → "Sarah". */
function firstName(label: string): string {
  const s = label.trim();
  const base = s.includes("@") ? s.split("@")[0].replace(/[._-]+/g, " ") : s;
  const word = base.split(/\s+/)[0] || "";
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "";
}

const isYou = (owner: string) => /^(you|me)$/i.test((owner || "").trim());
const ownerName = (owner: string) => (isYou(owner) ? "Me" : owner.trim() || "Unassigned");

export function buildFollowupEmail(meeting: Meeting): EmailDraft {
  const title = meeting.title?.trim() || "our meeting";
  const to = meeting.attendeeEmails ?? [];
  const names = (meeting.attendees ?? []).map(firstName).filter(Boolean);
  const greeting = names.length ? `Hi ${names.slice(0, 4).join(", ")},` : "Hi all,";

  const lines: string[] = [
    greeting,
    "",
    "Thanks for the time today — a quick recap and the next steps are below.",
    "",
  ];

  const summary = meeting.summary;
  if (summary?.executive?.trim()) {
    lines.push("Recap", summary.executive.trim(), "");
  }
  if (summary?.decisions?.length) {
    lines.push("Decisions");
    summary.decisions.forEach((d) => lines.push(`• ${d}`));
    lines.push("");
  }

  lines.push("Action items");
  const open = meeting.actionItems.filter((a) => a.status !== "done" && a.task.trim());
  if (open.length) {
    const order: string[] = [];
    const byOwner = new Map<string, ActionItem[]>();
    for (const a of open) {
      const key = ownerName(a.owner);
      if (!byOwner.has(key)) {
        byOwner.set(key, []);
        order.push(key);
      }
      byOwner.get(key)!.push(a);
    }
    for (const owner of order) {
      for (const a of byOwner.get(owner)!) {
        const due = a.due ? ` (due ${a.due})` : "";
        const urgent = a.urgency === "urgent" ? " [urgent]" : "";
        lines.push(`• ${owner}: ${a.task}${due}${urgent}`);
      }
    }
  } else {
    lines.push("• None");
  }

  lines.push("", "Best,");

  return {
    to,
    subject: `Recap & next steps — ${title}`,
    body: lines.join("\n"),
  };
}

/** A `mailto:` link that opens the user's mail client with the draft prefilled. */
export function mailtoLink(draft: EmailDraft): string {
  const params = new URLSearchParams({ subject: draft.subject, body: draft.body });
  // Recipients stay as literal comma-separated addresses (RFC 6068) — encoding
  // the commas as %2C breaks multi-recipient parsing in some mail clients.
  return `mailto:${draft.to.join(",")}?${params.toString()}`;
}
