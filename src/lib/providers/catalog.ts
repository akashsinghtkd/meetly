// Provider + model catalog with pricing.
//
// This is the single source of truth for "what can we call and what does it
// cost". Adding a new provider (Gemini, Ollama, Deepgram…) is just adding an
// entry here — the cost tracking and UI pick it up automatically.
//
// ⚠️ Prices are USD and are EDITABLE ESTIMATES. Providers change pricing; verify
// against the provider's pricing page. Costs are computed as usage × these rates
// (we capture real token/duration usage from the API response where available).

export type Capability = "transcription" | "chat" | "embedding";

export interface ModelPricing {
  /** Transcription: USD per minute of audio. */
  perAudioMinuteUsd?: number;
  /** Chat/embedding: USD per 1M input tokens. */
  inputPer1MUsd?: number;
  /** Chat: USD per 1M output tokens. */
  outputPer1MUsd?: number;
}

export interface ModelInfo {
  id: string; // API model id
  label: string;
  capabilities: Capability[];
  pricing: ModelPricing;
  /** Provider returns speaker labels (acoustic diarization). */
  diarizes?: boolean;
  /** Short quality hint shown in the picker. */
  quality?: "best" | "great" | "good";
}

export interface ProviderInfo {
  id: string;
  label: string;
  /** Local providers make no network cost and need no API key. */
  local?: boolean;
  requiresKey: boolean;
  /** Not yet implemented end-to-end — shown in UI but not selectable. */
  comingSoon?: boolean;
  models: ModelInfo[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    requiresKey: true,
    models: [
      {
        id: "gpt-4o-transcribe",
        label: "GPT-4o Transcribe",
        capabilities: ["transcription"],
        pricing: { perAudioMinuteUsd: 0.006 },
        quality: "best",
      },
      {
        id: "gpt-4o-mini-transcribe",
        label: "GPT-4o mini Transcribe",
        capabilities: ["transcription"],
        pricing: { perAudioMinuteUsd: 0.003 },
        quality: "good",
      },
      {
        id: "whisper-1",
        label: "Whisper v2 (segments)",
        capabilities: ["transcription"],
        pricing: { perAudioMinuteUsd: 0.006 },
        diarizes: false,
        quality: "great",
      },
      {
        id: "gpt-4o",
        label: "GPT-4o",
        capabilities: ["chat"],
        pricing: { inputPer1MUsd: 2.5, outputPer1MUsd: 10 },
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        capabilities: ["chat"],
        pricing: { inputPer1MUsd: 0.15, outputPer1MUsd: 0.6 },
      },
      {
        id: "text-embedding-3-small",
        label: "Embedding 3 small",
        capabilities: ["embedding"],
        pricing: { inputPer1MUsd: 0.02 },
      },
    ],
  },
  {
    id: "deepgram",
    label: "Deepgram",
    requiresKey: true,
    models: [
      {
        id: "nova-3",
        label: "Nova-3 (diarized)",
        capabilities: ["transcription"],
        pricing: { perAudioMinuteUsd: 0.0043 },
        diarizes: true,
        quality: "best",
      },
      {
        id: "nova-2",
        label: "Nova-2",
        capabilities: ["transcription"],
        pricing: { perAudioMinuteUsd: 0.0043 },
        diarizes: true,
        quality: "great",
      },
    ],
  },
  {
    id: "assemblyai",
    label: "AssemblyAI",
    requiresKey: true,
    comingSoon: true,
    models: [
      {
        // Async transcription with speaker_labels=true → real acoustic diarization.
        id: "assemblyai-best",
        label: "AssemblyAI (diarized)",
        capabilities: ["transcription"],
        pricing: { perAudioMinuteUsd: 0.0062 },
        diarizes: true,
        quality: "best",
      },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    requiresKey: true,
    comingSoon: true,
    models: [
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        capabilities: ["transcription", "chat"],
        pricing: { perAudioMinuteUsd: 0.003, inputPer1MUsd: 0.3, outputPer1MUsd: 2.5 },
      },
    ],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    local: true,
    requiresKey: false,
    comingSoon: true,
    models: [
      {
        id: "whisper",
        label: "whisper.cpp (local)",
        capabilities: ["transcription"],
        pricing: { perAudioMinuteUsd: 0 },
      },
      {
        id: "llama3.1",
        label: "Llama 3.1 (local)",
        capabilities: ["chat"],
        pricing: { inputPer1MUsd: 0, outputPer1MUsd: 0 },
      },
    ],
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getModel(providerId: string, modelId: string): ModelInfo | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

export function modelsFor(providerId: string, cap: Capability): ModelInfo[] {
  return getProvider(providerId)?.models.filter((m) => m.capabilities.includes(cap)) ?? [];
}

// ── Cost computation ────────────────────────────────────────────────────────

export function transcriptionCostUsd(pricing: ModelPricing, audioSeconds: number): number {
  return (audioSeconds / 60) * (pricing.perAudioMinuteUsd ?? 0);
}

export function chatCostUsd(pricing: ModelPricing, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * (pricing.inputPer1MUsd ?? 0) +
    (outputTokens / 1_000_000) * (pricing.outputPer1MUsd ?? 0)
  );
}
