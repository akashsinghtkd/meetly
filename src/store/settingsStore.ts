import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  chatProvider: string;
  chatModel: string;
}

// Quality/cost presets. Defaults keep the user's existing OpenAI key working;
// Deepgram is offered as the cheaper "best value" transcription upgrade.
export const PRESETS: Preset[] = [
  {
    id: "best",
    label: "Best quality",
    blurb: "Top accuracy. Best transcription + strongest notes model.",
    transcriptionProvider: "openai",
    transcriptionModel: "gpt-4o-transcribe",
    chatProvider: "openai",
    chatModel: "gpt-4o",
  },
  {
    id: "balanced",
    label: "Balanced",
    blurb: "Great quality at a fraction of the cost. Recommended.",
    transcriptionProvider: "openai",
    transcriptionModel: "gpt-4o-transcribe",
    chatProvider: "openai",
    chatModel: "gpt-4o-mini",
  },
  {
    id: "cheapest",
    label: "Cheapest",
    blurb: "Lowest cost, still very good for meetings.",
    transcriptionProvider: "openai",
    transcriptionModel: "gpt-4o-mini-transcribe",
    chatProvider: "openai",
    chatModel: "gpt-4o-mini",
  },
];

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
        set({
          transcriptionProvider: p.transcriptionProvider,
          transcriptionModel: p.transcriptionModel,
          chatProvider: p.chatProvider,
          chatModel: p.chatModel,
        });
      },

      hasKey: (providerId) => Boolean(get().apiKeys[providerId]?.trim()),

      activePreset: () => {
        const s = get();
        const match = PRESETS.find(
          (p) =>
            p.transcriptionProvider === s.transcriptionProvider &&
            p.transcriptionModel === s.transcriptionModel &&
            p.chatProvider === s.chatProvider &&
            p.chatModel === s.chatModel,
        );
        return match?.id ?? null;
      },
    }),
    { name: "meetly-settings", version: 2 },
  ),
);
