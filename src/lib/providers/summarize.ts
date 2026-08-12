// Summarization provider: turns a transcript into structured meeting notes.
// OpenAI implementation uses JSON-mode chat completion; a mock keeps the flow
// working with no key.

import { useSettings } from "../../store/settingsStore";
import { inTauri } from "../tauri";
import { chatCompletion } from "./chat";
import { apiBaseFor, isOpenAICompat } from "./catalog";
import type { Summary } from "../types";

export interface SummaryActionItem {
  /** The person responsible — "You" for the user, otherwise a speaker's name/label. */
  owner: string;
  task: string;
  due?: string;
  urgency?: "urgent" | "normal";
}

/** A real name the model overheard for a still-generic speaker label. */
export interface InferredSpeaker {
  /** The label as it appears in the transcript, e.g. "Speaker 2". */
  label: string;
  /** The name inferred from the conversation, e.g. "Sarah". */
  name: string;
  confidence: "high" | "medium" | "low";
}

export interface SummaryResult {
  summary: Summary;
  actionItems: SummaryActionItem[];
  speakerNames: InferredSpeaker[];
  inputTokens?: number;
  outputTokens?: number;
  estimated: boolean;
}

export interface TranscriptLine {
  speaker: string;
  text: string;
}

/** Extra context so the model can attribute tasks and learn names. */
export interface SummarizeContext {
  /** Distinct speaker labels present in the transcript (e.g. ["Me", "Speaker 2"]). */
  speakerLabels: string[];
  /** Which label is the user these notes are for — their tasks get owner "You". */
  youLabel: string;
  /** Invitees from the calendar event, if known — the roster to map speakers onto. */
  knownPeople?: string[];
}

export interface Summarizer {
  providerId: string;
  modelId: string;
  summarize(
    transcript: TranscriptLine[],
    title: string,
    ctx?: SummarizeContext,
  ): Promise<SummaryResult>;
}

const SYSTEM_PROMPT =
  "You are an expert meeting-notes assistant. You read a meeting transcript and " +
  "produce concise, accurate notes, and you keep careful track of WHO is " +
  "responsible for WHAT. Respond with ONLY a raw JSON object — no markdown, no " +
  "code fences. Only include items that are actually supported by the " +
  "transcript; use empty arrays when there is nothing to report.";

function buildUserPrompt(
  transcript: TranscriptLine[],
  title: string,
  ctx?: SummarizeContext,
): string {
  const lines = transcript.map((t) => `${t.speaker}: ${t.text}`).join("\n");
  const youLabel = ctx?.youLabel ?? "Me";
  const labels = ctx?.speakerLabels?.length ? ctx.speakerLabels.join(", ") : youLabel;
  const roster = ctx?.knownPeople?.length
    ? `\nInvitees on the calendar: ${ctx.knownPeople.join(", ")}. When you map a generic label like "Speaker 2" to a real name, PREFER a name from this list.\n`
    : "";
  return `Meeting title: ${title}

Speakers in this transcript: ${labels}
"${youLabel}" is the user these notes are for — attribute their tasks with owner "You".
${roster}
Transcript:
${lines}

Instructions:
- Attribute every action item to the ONE person responsible for it, using their
  speaker label (or a real name if you are confident of it), or "You" for ${youLabel}.
- Mark "urgency": "urgent" only when the transcript shows real time pressure — an
  explicit "urgent"/"ASAP", a near-term deadline, or a stated blocker. Otherwise "normal".
- For any generic label like "Speaker 2", try to infer the person's real name from
  the conversation — being addressed by name ("Sarah, can you…"), self-introductions,
  or sign-offs — preferring the calendar invitees above. Only include a name you
  actually saw evidence for, with a confidence.

Return a JSON object with EXACTLY this shape:
{
  "summary": "2-4 sentence executive summary",
  "decisions": ["short decision", ...],
  "risks": ["short risk", ...],
  "openQuestions": ["open question", ...],
  "nextAgenda": ["agenda item for next time", ...],
  "speakerNames": [{"label": "Speaker 2", "name": "Sarah", "confidence": "high|medium|low"}],
  "actionItems": [{"owner": "You|Sarah|Speaker 2", "task": "what to do", "due": "e.g. Fri or empty string", "urgency": "urgent|normal"}]
}`;
}

function normalizeSummary(raw: any): {
  summary: Summary;
  actionItems: SummaryActionItem[];
  speakerNames: InferredSpeaker[];
} {
  const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const summary: Summary = {
    executive: typeof raw?.summary === "string" ? raw.summary : "",
    decisions: arr(raw?.decisions),
    risks: arr(raw?.risks),
    openQuestions: arr(raw?.openQuestions),
    nextAgenda: arr(raw?.nextAgenda),
  };
  const actionItems: SummaryActionItem[] = Array.isArray(raw?.actionItems)
    ? raw.actionItems
        .filter((a: any) => a && typeof a.task === "string" && a.task.trim())
        .map((a: any) => ({
          owner: typeof a.owner === "string" ? a.owner : "",
          task: a.task,
          due: typeof a.due === "string" && a.due.trim() ? a.due : undefined,
          urgency: a.urgency === "urgent" ? "urgent" : "normal",
        }))
    : [];
  const confidences = ["high", "medium", "low"];
  const speakerNames: InferredSpeaker[] = Array.isArray(raw?.speakerNames)
    ? raw.speakerNames
        .filter(
          (s: any) =>
            s && typeof s.label === "string" && typeof s.name === "string" && s.name.trim(),
        )
        .map((s: any) => ({
          label: s.label.trim(),
          name: s.name.trim(),
          confidence: confidences.includes(s.confidence) ? s.confidence : "low",
        }))
    : [];
  return { summary, actionItems, speakerNames };
}

// Works for any OpenAI-compatible chat provider (OpenAI, Gemini) — only the
// base URL differs.
class OpenAICompatSummarizer implements Summarizer {
  constructor(
    public providerId: string,
    public modelId: string,
    private apiKey: string,
    private baseUrl?: string,
  ) {}

  async summarize(
    transcript: TranscriptLine[],
    title: string,
    ctx?: SummarizeContext,
  ): Promise<SummaryResult> {
    const out = await chatCompletion(
      this.modelId,
      this.apiKey,
      SYSTEM_PROMPT,
      buildUserPrompt(transcript, title, ctx),
      true,
      this.baseUrl,
    );
    let parsed: any = {};
    try {
      parsed = JSON.parse(out.content);
    } catch {
      // Best effort: pull the first {...} block if the model wrapped it.
      const match = out.content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }
    const { summary, actionItems, speakerNames } = normalizeSummary(parsed);
    return {
      summary,
      actionItems,
      speakerNames,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      estimated: false,
    };
  }
}

class MockSummarizer implements Summarizer {
  providerId = "mock";
  constructor(public modelId: string) {}

  async summarize(
    transcript: TranscriptLine[],
    _title: string,
    _ctx?: SummarizeContext,
  ): Promise<SummaryResult> {
    const preview = transcript.slice(0, 3).map((t) => t.text).join(" ");
    return {
      summary: {
        executive: transcript.length
          ? `Mock summary — the real notes are generated by an LLM once an API key is set. Discussed ${transcript.length} segments. ${preview}`
          : "No transcript was captured.",
        decisions: [],
        risks: [],
        openQuestions: [],
        nextAgenda: [],
      },
      actionItems: [],
      speakerNames: [],
      estimated: true,
    };
  }
}

export function getSummarizer(): Summarizer {
  const { chatProvider, chatModel, apiKeys } = useSettings.getState();
  const key = apiKeys[chatProvider]?.trim();
  if (inTauri() && isOpenAICompat(chatProvider) && key) {
    return new OpenAICompatSummarizer(chatProvider, chatModel, key, apiBaseFor(chatProvider));
  }
  return new MockSummarizer(chatModel);
}
