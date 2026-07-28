import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useTeamspace } from "../store/teamspaceStore";
import { BrandMark, Button } from "./ui";

const EMOJIS = ["🏢", "🚀", "💼", "🧠", "⚡️", "🌐", "📁", "🎯"];

export function CreateTeamspace() {
  const createTeamspace = useTeamspace((s) => s.createTeamspace);
  const busy = useTeamspace((s) => s.busy);
  const error = useTeamspace((s) => s.error);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏢");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createTeamspace(name.trim(), emoji);
    } catch {
      /* error surfaced via store */
    }
  };

  return (
    <div className="h-screen w-screen grid place-items-center bg-surface-sidebar px-4">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-8">
          <BrandMark size="lg" />
          <h1 className="mt-3 font-semibold text-ink text-xl tracking-tight">Create your teamspace</h1>
          <p className="mt-1.5 text-sm text-ink-light text-center max-w-sm">
            A teamspace is where your team’s meetings, projects, and tasks live. You can invite people next.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <label className="block text-[13px] font-medium text-ink mb-1.5">Icon</label>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className={`h-9 w-9 rounded-lg grid place-items-center text-lg transition-colors ${
                  emoji === em ? "bg-accent-soft ring-2 ring-accent/40" : "bg-surface-active hover:bg-surface-hover"
                }`}
              >
                {em}
              </button>
            ))}
          </div>

          <label className="block text-[13px] font-medium text-ink mb-1.5" htmlFor="ts-name">
            Teamspace name
          </label>
          <input
            id="ts-name"
            className="field mb-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc"
            autoFocus
          />
          <p className="text-[12px] text-ink-faint mb-4">You can rename this anytime in Team settings.</p>

          {error && (
            <p className="text-sm text-red-600 mb-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
