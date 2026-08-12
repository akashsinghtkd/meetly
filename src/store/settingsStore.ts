import { create } from "zustand";
import { persist } from "zustand/middleware";
import { modelsFor, type ModelInfo } from "../lib/providers/catalog";

// Persisted user settings. Transcription and chat pick their provider+model
// independently, so you can use the best value API for each. API keys live in
// localStorage for now (PLAN.md: move to OS keychain before shipping).

export type PresetId = "best" | "balanced" | "cheapest";

export interface Preset {
  id: PresetId;
  label: string;
  blurb: string;
  transcriptionProvider: string;
  transcriptionModel: string;
}

// Quality/cost presets. The transcription model is fixed per tier; the chat
// model is resolved *within whichever AI provider is active* (OpenAI or Gemini),
// so a preset respects your provider choice instead of overriding it.
export const PRESETS: Preset[] = [
  {
    id: "best",
    label: "Best quality",
    blurb: "Top accuracy. Best transcription + strongest notes model.",
    transcriptionProvider: "openai",
    transcriptionModel: "gpt-4o-transcribe",
  },
  {
    id: "balanced",
    label: "Balanced",
    blurb: "Great quality at a fraction of the cost. Recommended.",
    transcriptionProvider: "openai",
    transcriptionModel: "gpt-4o-transcribe",
  },
  {
    id: "cheapest",
    label: "Cheapest",
    blurb: "Lowest cost, still very good for meetings.",
    transcriptionProvider: "openai",
    transcriptionModel: "gpt-4o-mini-transcribe",
  },
];

const chatModelCost = (m: ModelInfo) =>
  (m.pricing.inputPer1MUsd ?? 0) + (m.pricing.outputPer1MUsd ?? 0);

/** The chat model matching a quality/cost tier within a provider. */
export function pickChatModel(providerId: string, tier: PresetId): string | undefined {
  const byCost = [...modelsFor(providerId, "chat")].sort((a, b) => chatModelCost(a) - chatModelCost(b));
  if (byCost.length === 0) return undefined;
  // "best" = the priciest (most capable); balanced/cheapest = the cheapest.
  return tier === "best" ? byCost[byCost.length - 1].id : byCost[0].id;
}

interface SettingsState {
  transcriptionProvider: string;
  transcriptionModel: string;
  chatProvider: string;
  chatModel: string;
  apiKeys: Record<string, string>;

  // money control
  monthlyBudgetUsd: number | null; // null = no budget
  hardCap: boolean; // block new API spend once budget is exceeded

  setTranscription: (provider: string, model: string) => void;
  setChat: (provider: string, model: string) => void;
  setApiKey: (providerId: string, key: string) => void;
  setMonthlyBudget: (usd: number | null) => void;
  setHardCap: (on: boolean) => void;
  applyPreset: (id: PresetId) => void;

  hasKey: (providerId: string) => boolean;
  activePreset: () => PresetId | null;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      transcriptionProvider: "openai",
      transcriptionModel: "gpt-4o-transcribe",
      chatProvider: "openai",
      chatModel: "gpt-4o-mini",
      apiKeys: {},
      monthlyBudgetUsd: 5,
      hardCap: false,

      setTranscription: (provider, model) =>
        set({ transcriptionProvider: provider, transcriptionModel: model }),
      setChat: (provider, model) => set({ chatProvider: provider, chatModel: model }),
      setApiKey: (providerId, key) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [providerId]: key } })),
      setMonthlyBudget: (usd) => set({ monthlyBudgetUsd: usd }),
      setHardCap: (on) => set({ hardCap: on }),

      applyPreset: (id) => {
        const p = PRESETS.find((x) => x.id === id);
        if (!p) return;
        // Keep the active chat provider; pick its model for this tier.
        const chatModel = pickChatModel(get().chatProvider, id) ?? get().chatModel;
        set({
          transcriptionProvider: p.transcriptionProvider,
          transcriptionModel: p.transcriptionModel,
          chatModel,
        });
      },

      hasKey: (providerId) => Boolean(get().apiKeys[providerId]?.trim()),

      activePreset: () => {
        const s = get();
        const match = PRESETS.find(
          (p) =>
            p.transcriptionProvider === s.transcriptionProvider &&
            p.transcriptionModel === s.transcriptionModel &&
            pickChatModel(s.chatProvider, p.id) === s.chatModel,
        );
        return match?.id ?? null;
      },
    }),
    { name: "meetly-settings", version: 2 },
  ),
);
