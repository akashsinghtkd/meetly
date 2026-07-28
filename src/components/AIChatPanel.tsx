import { useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { useStore } from "../store/store";
import { useCost } from "../store/costStore";
import { useSettings } from "../store/settingsStore";
import { askAssistant, type AssistantSource } from "../lib/providers/assistant";
import { getModel, chatCostUsd } from "../lib/providers/catalog";
import { formatUsd } from "../lib/money";

interface Msg {
  role: "user" | "assistant";
  text: string;
  sources?: AssistantSource[];
  costUsd?: number;
  estimated?: boolean;
  loading?: boolean;
}

const SUGGESTIONS = [
  "What did we decide?",
  "Who owns the API work?",
  "Summarize the last 3 meetings",
  "What are my open action items?",
];

export function AIChatPanel({ onClose }: { onClose: () => void }) {
  const meetings = useStore((s) => s.meetings);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "", loading: true }]);

    try {
      const result = await askAssistant(q, meetings);

      // Log cost (token-accurate for real calls).
      const settings = useSettings.getState();
      const model = getModel(settings.chatProvider, settings.chatModel);
      const costUsd = model
        ? chatCostUsd(model.pricing, result.inputTokens ?? 0, result.outputTokens ?? 0)
        : 0;
      useCost.getState().add({
        provider: settings.chatProvider,
        model: settings.chatModel,
        kind: "chat",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        estimated: result.estimated,
      });

      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: "assistant",
          text: result.answer,
          sources: result.sources,
          costUsd,
          estimated: result.estimated,
        };
        return next;
      });
    } catch (e) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "assistant", text: `Error: ${String(e)}` };
        return next;
      });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight));
    }
  }

  return (
    <div className="w-96 shrink-0 h-full border-l border-line bg-surface flex flex-col">
      <div className="flex items-center justify-between px-4 h-12 border-b border-line">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <Sparkles className="h-4 w-4 text-accent" /> Ask AI
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-surface-hover text-ink-faint">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-ink-light">
            <p className="mb-3">Ask anything across all your meetings.</p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left rounded-md border border-line px-3 py-2 text-sm hover:bg-surface-hover text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "bg-accent text-white rounded-2xl rounded-br-sm px-3 py-2 text-sm max-w-[85%]"
                  : "text-ink text-sm whitespace-pre-wrap leading-relaxed w-full"
              }
            >
              {m.loading ? (
                <span className="flex items-center gap-2 text-ink-faint">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </span>
              ) : (
                m.text
              )}
              {!m.loading && m.role === "assistant" && (m.sources?.length || m.costUsd !== undefined) && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {m.sources?.map((s) => (
                    <span key={s.id} className="text-[10px] text-ink-faint bg-surface-active rounded px-1.5 py-0.5">
                      {s.title}
                    </span>
                  ))}
                  {m.costUsd !== undefined && (
                    <span className="ml-auto text-[10px] text-ink-faint tabular-nums">
                      {formatUsd(m.costUsd)}
                      {m.estimated ? " est." : ""}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-line">
        <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 focus-within:border-accent">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask about your meetings…"
            className="flex-1 bg-transparent outline-none text-sm"
            disabled={busy}
          />
          <button
            onClick={() => send(input)}
            className="text-accent disabled:text-ink-faint"
            disabled={!input.trim() || busy}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
