// "Ask across your meetings": retrieve the most relevant passages (semantic
// search) and have the chat model write a grounded, cited answer from them.
// Retrieval works offline; the written answer needs an OpenAI chat key.

import { useSettings } from "../store/settingsStore";
import { useCost } from "../store/costStore";
import { apiBaseFor, chatCostUsd, getModel, isOpenAICompat } from "./providers/catalog";
import { chatCompletion } from "./providers/chat";
import { retrievePassages, type Passage } from "./semanticSearch";
import { budgetStatus } from "./budget";
import { inTauri } from "./tauri";
import type { Meeting } from "./types";

export interface MeetingAnswer {
  answer: string;
  sources: { meetingId: string; title: string }[];
  /** false when no chat key is set — retrieval still ran, just no written answer. */
  answered: boolean;
}

/** Can we generate a written answer? (needs an OpenAI-compatible chat key under Tauri) */
export function canAnswer(): boolean {
  const { chatProvider, apiKeys } = useSettings.getState();
  return Boolean(inTauri() && isOpenAICompat(chatProvider) && apiKeys[chatProvider]?.trim());
}

function dedupeSources(passages: Passage[]): { meetingId: string; title: string }[] {
  const seen = new Set<string>();
  const out: { meetingId: string; title: string }[] = [];
  for (const p of passages) {
    if (seen.has(p.meetingId)) continue;
    seen.add(p.meetingId);
    out.push({ meetingId: p.meetingId, title: p.title });
  }
  return out;
}

const SYSTEM =
  "You answer the user's question using ONLY the meeting excerpts provided. Be " +
  "concise and specific, and refer to meetings by their title when relevant. If " +
  "the excerpts do not contain the answer, say you couldn't find it in the " +
  "meetings — do not guess.";

export async function askAcrossMeetings(
  question: string,
  meetings: Meeting[],
): Promise<MeetingAnswer> {
  const passages = await retrievePassages(question, meetings, 8);
  const sources = dedupeSources(passages);

  // Retrieval already degrades to offline embeddings under the cap; also skip the
  // paid written answer rather than spending past the budget.
  if (!canAnswer() || passages.length === 0 || budgetStatus().blocked) {
    return { answer: "", sources, answered: false };
  }

  const { chatProvider, chatModel, apiKeys } = useSettings.getState();
  const key = apiKeys[chatProvider]!.trim();
  const context = passages.map((p, i) => `[${i + 1}] "${p.title}": ${p.text}`).join("\n\n");
  const user = `Question: ${question}\n\nMeeting excerpts:\n${context}`;

  const out = await chatCompletion(chatModel, key, SYSTEM, user, false, apiBaseFor(chatProvider));

  const model = getModel(chatProvider, chatModel);
  useCost.getState().add({
    provider: chatProvider,
    model: chatModel,
    kind: "chat",
    inputTokens: out.inputTokens,
    outputTokens: out.outputTokens,
    costUsd: model ? chatCostUsd(model.pricing, out.inputTokens ?? 0, out.outputTokens ?? 0) : 0,
    estimated: false,
  });

  return { answer: out.content.trim(), sources, answered: true };
}
