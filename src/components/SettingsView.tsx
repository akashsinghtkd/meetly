import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Coins, ExternalLink, Gauge, KeyRound, Mic, Cpu, Sparkles, Volume2, Wallet } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store/store";
import {
  useSettings,
  PRESETS,
  pickChatModel,
  pickTranscriptionModel,
  type PresetId,
} from "../store/settingsStore";
import { useCost } from "../store/costStore";
import { listAudioDevices, inTauri } from "../lib/tauri";
import {
  PROVIDERS,
  getProvider,
  getModel,
  modelsFor,
  type Capability,
  type ProviderInfo,
} from "../lib/providers/catalog";
import { formatUsd, formatTokens } from "../lib/money";
import type { AudioDevice } from "../lib/types";

export function SettingsView() {
  return (
    <div className="max-w-2xl mx-auto px-16 py-12">
      <h1 className="text-2xl font-bold text-ink tracking-tight mb-8">Settings</h1>

      {!inTauri() && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Running in browser preview. Real API calls only run in the desktop app
          (<code className="text-xs">npm run app</code>); here transcription uses a mock.
        </div>
      )}

      <AiProviderCard />
      <PresetCard />
      <BudgetCard />
      <AdvancedSettings />
      <UsageCard />
    </div>
  );
}

/** Everything most people never need to touch — collapsed by default. */
function AdvancedSettings() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-3 flex w-full items-center gap-1.5 text-sm font-semibold text-ink-light hover:text-ink"
      >
        <ChevronRight className={clsx("h-4 w-4 transition-transform", open && "rotate-90")} />
        Advanced settings
        <span className="text-xs font-normal text-ink-faint">Transcription &amp; audio input</span>
      </button>
      {open && (
        <>
          <ModelCard
            capability="transcription"
            title="Transcription"
            subtitle="Turns meeting audio into text (billed per minute)."
          />
          <ApiKeysCard />
          <AudioDevicesCard />
        </>
      )}
    </div>
  );
}

async function openExternal(url: string) {
  try {
    if (inTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } else {
      window.open(url, "_blank");
    }
  } catch {
    /* ignore */
  }
}

/** "an" for a vowel-initial label ("OpenAI"), "a" otherwise ("Google Gemini"). */
function article(label: string): string {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

/**
 * Dead-simple AI setup: pick a provider, paste one key. The specific model is
 * chosen by the Quality preset below, so there are no per-model chips or pricing
 * to wade through here. OpenAI and Gemini share the same OpenAI-compatible path,
 * so switching is one click. Works on web, macOS, and Windows.
 */
function AiProviderCard() {
  const chatProvider = useSettings((s) => s.chatProvider);
  const setChat = useSettings((s) => s.setChat);
  const setTranscription = useSettings((s) => s.setTranscription);
  const apiKeys = useSettings((s) => s.apiKeys);
  const setApiKey = useSettings((s) => s.setApiKey);
  const tier = useSettings((s) => s.activePreset()) ?? "balanced";

  const providers = PROVIDERS.filter(
    (p) => !p.comingSoon && p.requiresKey && p.models.some((m) => m.capabilities.includes("chat")),
  );
  const active = providers.find((p) => p.id === chatProvider) ?? providers[0];
  const activeHasKey = Boolean(apiKeys[active.id]?.trim());

  // Picking a provider points BOTH notes/chat and (if supported) transcription
  // at it, so one key can power everything — the model tier follows the preset.
  const choose = (p: ProviderInfo) => {
    const chat = pickChatModel(p.id, tier) ?? modelsFor(p.id, "chat")[0]?.id;
    if (chat) setChat(p.id, chat);
    const trans = pickTranscriptionModel(p.id, tier) ?? modelsFor(p.id, "transcription")[0]?.id;
    if (trans) setTranscription(p.id, trans);
  };

  return (
    <Card
      icon={<Cpu className="h-4 w-4" />}
      title="AI provider"
      subtitle="Who powers your notes, chat, and search. Pick one and paste its key."
    >
      {/* Step 1 — pick a provider. */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {providers.map((p) => {
          const selected = active.id === p.id;
          const connected = Boolean(apiKeys[p.id]?.trim());
          return (
            <button
              key={p.id}
              onClick={() => choose(p)}
              className={clsx(
                "rounded-lg border p-3 text-left transition-colors",
                selected ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-hover",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-ink">{p.label}</span>
                {selected && <Check className="ml-auto h-4 w-4 text-accent" />}
              </div>
              <div className="mt-1 text-xs">
                {connected ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Check className="h-3 w-3" /> Connected
                  </span>
                ) : (
                  <span className="text-ink-faint">No key yet</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Step 2 — paste the key for whichever is selected. */}
      <label className="mb-1.5 block text-[13px] font-medium text-ink-light">
        {active.label} API key
      </label>
      <input
        type="password"
        value={apiKeys[active.id] ?? ""}
        onChange={(e) => setApiKey(active.id, e.target.value)}
        placeholder={active.id === "openai" ? "sk-…" : "API key…"}
        className="w-full rounded-md border border-line px-3 py-2 font-mono text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        {active.keyUrl ? (
          <button
            onClick={() => openExternal(active.keyUrl!)}
            className="inline-flex items-center gap-1 text-[12px] text-ink-faint hover:text-accent"
          >
            Get {article(active.label)} {active.label} key <ExternalLink className="h-3 w-3" />
          </button>
        ) : (
          <span />
        )}
        {!activeHasKey && (
          <span className="text-[12px] text-ink-faint">Needed to turn on real AI.</span>
        )}
      </div>
    </Card>
  );
}

function Card({
  icon,
  title,
  subtitle,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 rounded-lg border border-line p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-ink font-semibold mb-0.5">
            <span className="text-ink-light">{icon}</span>
            {title}
          </div>
          {subtitle && <p className="text-sm text-ink-light mb-3">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Rough cost per hour of a 2-channel meeting, transcription-dominated. */
function estPerHour(tProvider: string, tModel: string): number {
  const m = getModel(tProvider, tModel);
  const perMin = m?.pricing.perAudioMinuteUsd ?? 0;
  return perMin * 60 * 2; // mic + system channels
}

function PresetCard() {
  const applyPreset = useSettings((s) => s.applyPreset);
  const active = useSettings((s) => s.activePreset());
  const transcriptionProvider = useSettings((s) => s.transcriptionProvider);

  return (
    <Card icon={<Gauge className="h-4 w-4" />} title="Quality & cost" subtitle="Pick a balance of quality and price — this chooses the AI + transcription models for you.">
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((p) => {
          const perHr = estPerHour(
            transcriptionProvider,
            pickTranscriptionModel(transcriptionProvider, p.id) ?? "",
          );
          return (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id as PresetId)}
              className={clsx(
                "rounded-lg border p-3 text-left transition-colors",
                active === p.id ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-hover",
              )}
            >
              <div className="font-medium text-ink text-sm flex items-center gap-1">
                {p.id === "balanced" && <Sparkles className="h-3.5 w-3.5 text-accent" />}
                {p.label}
              </div>
              <div className="text-[11px] text-ink-light mt-1 leading-snug">{p.blurb}</div>
              <div className="text-[11px] text-ink-faint mt-2 tabular-nums">~{formatUsd(perHr)}/hr</div>
            </button>
          );
        })}
      </div>
      {active === null && (
        <p className="text-[11px] text-ink-faint mt-2">Custom configuration (models set manually below).</p>
      )}
    </Card>
  );
}

function BudgetCard() {
  const monthlyBudgetUsd = useSettings((s) => s.monthlyBudgetUsd);
  const hardCap = useSettings((s) => s.hardCap);
  const setMonthlyBudget = useSettings((s) => s.setMonthlyBudget);
  const setHardCap = useSettings((s) => s.setHardCap);
  const spent = useCost((s) => s.monthRealSpend());

  const budget = monthlyBudgetUsd;
  const fraction = budget && budget > 0 ? Math.min(spent / budget, 1) : 0;
  const over = budget != null && spent >= budget;
  const warn = budget != null && fraction >= 0.8;
  const barColor = over ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Card icon={<Wallet className="h-4 w-4" />} title="Monthly budget" subtitle="Track and cap what you spend on APIs each month.">
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-ink-light">Budget</label>
        <div className="flex items-center gap-1">
          <span className="text-ink-faint">$</span>
          <input
            type="number"
            min={0}
            step={1}
            value={budget ?? ""}
            placeholder="none"
            onChange={(e) => setMonthlyBudget(e.target.value === "" ? null : Number(e.target.value))}
            className="w-20 rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <span className="text-ink-faint text-sm">/ month</span>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-light cursor-pointer">
          <input type="checkbox" checked={hardCap} onChange={(e) => setHardCap(e.target.checked)} className="accent-accent" />
          Hard stop
        </label>
      </div>

      {budget != null && (
        <>
          <div className="h-2 rounded-full bg-surface-active overflow-hidden">
            <div className={clsx("h-full transition-all", barColor)} style={{ width: `${fraction * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs mt-1.5">
            <span className={clsx("tabular-nums", over ? "text-red-600" : "text-ink-light")}>
              {formatUsd(spent)} spent
            </span>
            <span className="text-ink-faint tabular-nums">of {formatUsd(budget)}</span>
          </div>
        </>
      )}
      <p className="text-[12px] text-ink-faint mt-2">
        {hardCap
          ? "Hard stop is on — recording, transcription, and AI stop once the budget is hit."
          : "Warning only — you'll see alerts but spending continues. Turn on “Hard stop” to block."}{" "}
        Only real (billed) calls count, not mock estimates.
      </p>
    </Card>
  );
}

function ModelCard({
  capability,
  title,
  subtitle,
}: {
  capability: Capability;
  title: string;
  subtitle: string;
}) {
  const isTranscription = capability === "transcription";
  const provider = useSettings((s) => (isTranscription ? s.transcriptionProvider : s.chatProvider));
  const model = useSettings((s) => (isTranscription ? s.transcriptionModel : s.chatModel));
  const setTranscription = useSettings((s) => s.setTranscription);
  const setChat = useSettings((s) => s.setChat);

  const providers = PROVIDERS.filter((p) => p.models.some((m) => m.capabilities.includes(capability)));
  const models = modelsFor(provider, capability);

  const choose = (prov: string, mod: string) =>
    isTranscription ? setTranscription(prov, mod) : setChat(prov, mod);

  return (
    <Card icon={<Sparkles className="h-4 w-4" />} title={title} subtitle={subtitle}>
      <div className="flex flex-wrap gap-2 mb-4">
        {providers.map((p) => (
          <button
            key={p.id}
            disabled={p.comingSoon}
            onClick={() => {
              const first = modelsFor(p.id, capability)[0];
              if (first) choose(p.id, first.id);
            }}
            className={clsx(
              "rounded-md border px-3 py-1.5 text-sm flex items-center gap-1.5",
              provider === p.id ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-light",
              p.comingSoon && "opacity-50 cursor-not-allowed",
            )}
          >
            {p.label}
            {p.local && <span className="text-[10px] text-emerald-600">$0</span>}
            {p.comingSoon && <span className="text-[10px] text-ink-faint">soon</span>}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => choose(provider, m.id)}
            className={clsx(
              "w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left",
              model === m.id ? "bg-accent-soft" : "hover:bg-surface-hover",
            )}
          >
            <span className={clsx("h-4 w-4", model === m.id ? "text-accent" : "text-transparent")}>
              <Check className="h-4 w-4" />
            </span>
            <span className="text-ink">{m.label}</span>
            {m.diarizes && (
              <span className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">diarization</span>
            )}
            {m.quality && (
              <span className="text-[10px] text-ink-faint uppercase tracking-wide">{m.quality}</span>
            )}
            <span className="ml-auto text-xs text-ink-faint tabular-nums">
              {isTranscription
                ? m.pricing.perAudioMinuteUsd === 0
                  ? "free"
                  : `${formatUsd(m.pricing.perAudioMinuteUsd ?? 0)}/min`
                : `${formatUsd(m.pricing.inputPer1MUsd ?? 0)}/${formatUsd(m.pricing.outputPer1MUsd ?? 0)} per 1M`}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function ApiKeysCard() {
  const transcriptionProvider = useSettings((s) => s.transcriptionProvider);
  const apiKeys = useSettings((s) => s.apiKeys);
  const setApiKey = useSettings((s) => s.setApiKey);

  // Chat-provider keys live in the AI provider card; here we only cover a
  // transcription-only provider's key (e.g. Deepgram).
  const needed = useMemo(() => {
    const p = getProvider(transcriptionProvider);
    const isChatProvider = p?.models.some((m) => m.capabilities.includes("chat"));
    return p && p.requiresKey && !isChatProvider ? [p] : [];
  }, [transcriptionProvider]);

  if (needed.length === 0) return null;

  return (
    <Card icon={<KeyRound className="h-4 w-4" />} title="Transcription API key" subtitle="Stored locally; sent only to the matching provider.">
      <div className="space-y-3">
        {needed.map(
          (p) =>
            p && (
              <div key={p.id}>
                <label className="block text-[13px] font-medium text-ink-light mb-1.5">{p.label}</label>
                <input
                  type="password"
                  value={apiKeys[p.id] ?? ""}
                  onChange={(e) => setApiKey(p.id, e.target.value)}
                  placeholder={p.id === "openai" ? "sk-…" : "key…"}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent font-mono"
                />
              </div>
            ),
        )}
      </div>
    </Card>
  );
}

function AudioDevicesCard() {
  const micDevice = useStore((s) => s.micDevice);
  const systemDevice = useStore((s) => s.systemDevice);
  const setDevices = useStore((s) => s.setDevices);
  const [devices, setDevices_] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAudioDevices()
      .then(setDevices_)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card icon={<Mic className="h-4 w-4" />} title="Audio input">
      <label className="block text-[13px] font-medium text-ink-light mb-1.5 flex items-center gap-1.5">
        <Mic className="h-3.5 w-3.5" /> Microphone (the “Me” channel)
      </label>
      <DeviceSelect devices={devices} loading={loading} value={micDevice} allowNone={false} onChange={(name) => setDevices(name, systemDevice)} />

      <label className="block text-[13px] font-medium text-ink-light mb-1.5 mt-4 flex items-center gap-1.5">
        <Volume2 className="h-3.5 w-3.5" /> System audio (the “Them” channel)
      </label>
      <DeviceSelect devices={devices} loading={loading} value={systemDevice} allowNone preferLoopback onChange={(name) => setDevices(micDevice, name)} />
      <p className="text-[12px] text-ink-faint mt-3 leading-relaxed">
        To capture the other participants: on <span className="font-medium text-ink-light">Windows</span>,
        pick a device marked <span className="font-medium text-ink-light">(loopback)</span> — no install
        needed. On <span className="font-medium text-ink-light">macOS</span>, install a loopback device
        (<span className="font-medium text-ink-light">brew install blackhole-2ch</span>).
      </p>
    </Card>
  );
}

function UsageCard() {
  const records = useCost((s) => s.records);
  const reset = useCost((s) => s.reset);

  const { total, estimated, byProvider, recent } = useMemo(() => {
    const total = records.reduce((n, r) => n + r.costUsd, 0);
    const estimated = records.filter((r) => r.estimated).reduce((n, r) => n + r.costUsd, 0);
    const map = new Map<string, { provider: string; costUsd: number; calls: number }>();
    for (const r of records) {
      const cur = map.get(r.provider) ?? { provider: r.provider, costUsd: 0, calls: 0 };
      cur.costUsd += r.costUsd;
      cur.calls += 1;
      map.set(r.provider, cur);
    }
    const byProvider = [...map.values()].sort((a, b) => b.costUsd - a.costUsd);
    const recent = [...records].reverse().slice(0, 8);
    return { total, estimated, byProvider, recent };
  }, [records]);

  return (
    <Card icon={<Coins className="h-4 w-4" />} title="Usage & cost (all time)">
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-3xl font-bold text-ink tabular-nums">{formatUsd(total)}</div>
          <div className="text-xs text-ink-faint">
            {records.length} API call{records.length === 1 ? "" : "s"}
            {estimated > 0 && ` · incl. ${formatUsd(estimated)} estimated (mock)`}
          </div>
        </div>
        {records.length > 0 && (
          <button onClick={reset} className="text-xs text-ink-faint hover:text-red-500 border border-line rounded-md px-2 py-1">
            Reset ledger
          </button>
        )}
      </div>

      {byProvider.length > 0 && (
        <div className="space-y-1 mb-4">
          {byProvider.map((p) => (
            <div key={p.provider} className="flex items-center text-sm">
              <span className="text-ink">{getProvider(p.provider)?.label ?? p.provider}</span>
              <span className="text-ink-faint ml-2 text-xs">{p.calls} calls</span>
              <span className="ml-auto tabular-nums text-ink">{formatUsd(p.costUsd)}</span>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 ? (
        <div className="border-t border-line pt-3">
          <div className="block-heading">Recent calls</div>
          <div className="space-y-1">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <span className="text-ink-faint w-16 shrink-0">{r.kind}</span>
                <span className="text-ink-light truncate flex-1">{r.model}</span>
                {r.audioSeconds !== undefined && <span className="text-ink-faint">{r.audioSeconds.toFixed(0)}s</span>}
                {(r.inputTokens || r.outputTokens) && (
                  <span className="text-ink-faint">{formatTokens((r.inputTokens ?? 0) + (r.outputTokens ?? 0))} tok</span>
                )}
                <span className="tabular-nums text-ink w-16 text-right">{formatUsd(r.costUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-faint">No API calls yet.</p>
      )}
    </Card>
  );
}

function DeviceSelect({
  devices,
  loading,
  value,
  onChange,
  allowNone,
  preferLoopback,
}: {
  devices: AudioDevice[];
  loading: boolean;
  value: string | null;
  onChange: (name: string | null) => void;
  allowNone: boolean;
  preferLoopback?: boolean;
}) {
  if (loading) return <div className="text-sm text-ink-faint">Loading devices…</div>;
  return (
    <div className="space-y-1">
      {allowNone && <Row selected={value === null} onClick={() => onChange(null)} label="Off — don’t capture system audio" />}
      {devices.map((d) => (
        <Row
          key={d.name}
          selected={value === d.name}
          onClick={() => onChange(d.name)}
          label={d.name}
          badge={preferLoopback && d.likely_system_audio ? "loopback" : d.is_default ? "default" : undefined}
        />
      ))}
    </div>
  );
}

function Row({ selected, onClick, label, badge }: { selected: boolean; onClick: () => void; label: string; badge?: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors",
        selected ? "bg-accent-soft text-ink" : "hover:bg-surface-hover text-ink-light",
      )}
    >
      <span className={clsx("h-4 w-4 shrink-0", selected ? "text-accent" : "text-transparent")}>
        <Check className="h-4 w-4" />
      </span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="text-[10px] uppercase tracking-wide text-ink-faint bg-surface-active rounded px-1.5 py-0.5">{badge}</span>
      )}
    </button>
  );
}
