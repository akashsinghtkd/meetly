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
}

// Quality/cost presets. Both the chat and transcription models are resolved
// *within whichever providers are active* (OpenAI, Gemini, Deepgram), so a
// preset tunes quality/cost without overriding your provider choice.
export const PRESETS: Preset[] = [
  { id: "best", label: "Best quality", blurb: "Top accuracy. Best transcription + strongest notes model." },
  { id: "balanced", label: "Balanced", blurb: "Great quality at a fraction of the cost. Recommended." },
  { id: "cheapest", label: "Cheapest", blurb: "Lowest cost, still very good for meetings." },
];

const chatModelCost = (m: ModelInfo) =>
  (m.pricing.inputPer1MUsd ?? 0) + (m.pricing.outputPer1MUsd ?? 0);
const QUALITY_ORDER: Record<string, number> = { best: 0, great: 1, good: 2 };

/** The chat model matching a quality/cost tier within a provider. */
export function pickChatModel(providerId: string, tier: PresetId): string | undefined {
  const byCost = [...modelsFor(providerId, "chat")].sort((a, b) => chatModelCost(a) - chatModelCost(b));
  if (byCost.length === 0) return undefined;
  // "best" = the priciest (most capable); balanced/cheapest = the cheapest.
  return tier === "best" ? byCost[byCost.length - 1].id : byCost[0].id;
}

/** The transcription model matching a tier within a provider. */
export function pickTranscriptionModel(providerId: string, tier: PresetId): string | undefined {
  const models = modelsFor(providerId, "transcription");
  if (models.length === 0) return undefined;
  if (tier === "cheapest") {
    return [...models].sort(
      (a, b) => (a.pricing.perAudioMinuteUsd ?? 0) - (b.pricing.perAudioMinuteUsd ?? 0),
    )[0].id;
  }
  // best & balanced → the highest-quality transcription model.
  return [...models].sort(
    (a, b) => (QUALITY_ORDER[a.quality ?? "good"] ?? 3) - (QUALITY_ORDER[b.quality ?? "good"] ?? 3),
  )[0].id;
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
        // Keep the active providers; pick each one's model for this tier.
        const s = get();
        set({
          chatModel: pickChatModel(s.chatProvider, id) ?? s.chatModel,
          transcriptionModel: pickTranscriptionModel(s.transcriptionProvider, id) ?? s.transcriptionModel,
        });
      },

      hasKey: (providerId) => Boolean(get().apiKeys[providerId]?.trim()),

      activePreset: () => {
        const s = get();
        const match = PRESETS.find(
          (p) =>
            pickChatModel(s.chatProvider, p.id) === s.chatModel &&
            pickTranscriptionModel(s.transcriptionProvider, p.id) === s.transcriptionModel,
        );
        return match?.id ?? null;
      },
    }),
    { name: "meetly-settings", version: 2 },
  ),
);
