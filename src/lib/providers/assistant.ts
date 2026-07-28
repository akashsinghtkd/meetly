// "Ask AI" assistant — answers questions across all meetings.
//
// Phase 6-lite: keyword retrieval over meetings builds the context, which is
// sent to the chat model. (Full semantic RAG with embeddings is the Phase 4/6
// upgrade.) A mock keeps it working with no API key.

import { useSettings } from "../../store/settingsStore";
import { budgetStatus } from "../budget";
import { teamAiAllowed, teamAiBlockMessage } from "../billing/limits";
import { inTauri } from "../tauri";
import { chatCompletion } from "./chat";
import type { Meeting } from "../types";

export interface AssistantSource {
  id: string;
  title: string;
}

export interface AssistantResult {
  answer: string;
  sources: AssistantSource[];
  inputTokens?: number;
  outputTokens?: number;
  estimated: boolean;
}

function meetingBlock(m: Meeting): string {
  const parts: string[] = [`### ${m.title} — ${new Date(m.startedAt).toDateString()}`];
  if (m.summary?.executive) parts.push(`Summary: ${m.summary.executive}`);
  if (m.summary?.decisions?.length) parts.push(`Decisions: ${m.summary.decisions.join("; ")}`);
  if (m.actionItems.length)
    parts.push(
      `Action items: ${m.actionItems
        .map((a) => `${a.task} (owner: ${a.owner || "unassigned"}, ${a.status})`)
        .join("; ")}`,
    );
  if (m.transcript.length)
    parts.push(`Transcript excerpt: ${m.transcript.slice(0, 24).map((s) => s.text).join(" ")}`);
  return parts.join("\n");
}

function relevance(m: Meeting, question: string): number {
  const hay = (
    m.title +
    " " +
    (m.summary?.executive ?? "") +
    " " +
    (m.summary?.decisions ?? []).join(" ") +
    " " +
    m.actionItems.map((a) => `${a.owner} ${a.task}`).join(" ") +
    " " +
    m.transcript.map((s) => s.text).join(" ")
  ).toLowerCase();
  const terms = question
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);
  return terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
}

/** Pick relevant meetings (falls back to most recent) and build the LLM context. */
function retrieve(meetings: Meeting[], question: string) {
  const scored = meetings
    .map((m) => ({ m, score: relevance(m, question) }))
    .sort((a, b) => b.score - a.score);

  let chosen = scored.filter((s) => s.score > 0).slice(0, 6).map((s) => s.m);
  if (chosen.length === 0) {
    chosen = [...meetings]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 6);
  }
  const context = chosen.map(meetingBlock).join("\n\n");
  const sources = chosen.map((m) => ({ id: m.id, title: m.title }));
  return { context, sources };
}

const SYSTEM_PROMPT =
  "You are Meetly's meeting assistant. Answer the user's question using ONLY the " +
  "provided meeting notes and transcript excerpts. Be concise and specific. Cite " +
  "meetings by their title in your answer. If the answer isn't in the notes, say so " +
  "plainly rather than guessing.";

async function realAnswer(
  question: string,
  meetings: Meeting[],
  apiKey: string,
): Promise<AssistantResult> {
  const { chatModel } = useSettings.getState();
  const { context, sources } = retrieve(meetings, question);
  const user = `Meeting notes:\n\n${context}\n\n---\nQuestion: ${question}`;
  const out = await chatCompletion(chatModel, apiKey, SYSTEM_PROMPT, user, false);
  return {
    answer: out.content.trim(),
    sources,
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    estimated: false,
  };
}

/** Deterministic local answer when there's no API key. */
function mockAnswer(question: string, meetings: Meeting[]): AssistantResult {
  const q = question.toLowerCase();
  const { sources } = retrieve(meetings, question);

  if (q.includes("decide") || q.includes("decision")) {
    const decisions = meetings.flatMap((m) =>
      (m.summary?.decisions ?? []).map((d) => `• ${d} — ${m.title}`),
    );
    return {
      answer: decisions.length
        ? `Decisions across your meetings:\n\n${decisions.join("\n")}`
        : "I couldn't find any recorded decisions yet.",
      sources,
      estimated: true,
    };
  }
  if (q.includes("owns") || q.includes("who") || q.includes("owner")) {
    const owners = meetings.flatMap((m) =>
      m.actionItems
        .filter((a) => a.status === "open")
        .map((a) => `• ${a.owner || "Unassigned"}: ${a.task} — ${m.title}`),
    );
    return {
      answer: owners.length ? `Open ownership:\n\n${owners.join("\n")}` : "No open action items are assigned.",
      sources,
      estimated: true,
    };
  }
  if (q.includes("action") || q.includes("task") || q.includes("todo")) {
    const open = meetings.flatMap((m) =>
      m.actionItems.filter((a) => a.status === "open").map((a) => `• ${a.task} (${a.owner || "unassigned"})`),
    );
    return {
      answer: open.length ? `Open action items:\n\n${open.join("\n")}` : "You're all caught up.",
      sources,
      estimated: true,
    };
  }
  if (q.includes("summ")) {
    const s = meetings
      .slice(0, 3)
      .map((m) => `**${m.emoji} ${m.title}** — ${m.summary?.executive ?? "No summary yet."}`)
      .join("\n\n");
    return { answer: s || "No meetings to summarize yet.", sources, estimated: true };
  }
  return {
    answer:
      "Set an OpenAI key in Settings and I'll answer this from your full meeting history. " +
      "For now I can answer about decisions, owners, action items, and summaries.",
    sources,
    estimated: true,
  };
}

export async function askAssistant(question: string, meetings: Meeting[]): Promise<AssistantResult> {
  const { chatProvider, apiKeys } = useSettings.getState();
  const key = apiKeys[chatProvider]?.trim();
  if (inTauri() && chatProvider === "openai" && key) {
    if (budgetStatus().blocked) {
      return {
        answer: "Monthly budget reached — increase or turn off the spending cap in Settings to use Ask AI.",
        sources: [],
        estimated: true,
      };
    }
    if (!teamAiAllowed()) {
      return {
        answer: teamAiBlockMessage(),
        sources: [],
        estimated: true,
      };
    }
    return realAnswer(question, meetings, key);
  }
  return mockAnswer(question, meetings);
}
