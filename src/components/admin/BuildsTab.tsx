import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, Rocket, Trash2 } from "lucide-react";
import { Button } from "../ui";
import { useAdminConsole } from "../../store/adminConsoleStore";
import { supabaseUrl } from "../../lib/supabase";
import { relativeDate } from "../../lib/format";

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const mb = bytes / 1e6;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1e3).toFixed(0)} KB`;
}

function publicBuildUrl(name: string): string {
  return `${supabaseUrl}/storage/v1/object/public/builds/${name}`;
}

export function BuildsTab() {
  const builds = useAdminConsole((s) => s.builds);
  const busy = useAdminConsole((s) => s.busy);
  const loadBuilds = useAdminConsole((s) => s.loadBuilds);
  const deleteBuild = useAdminConsole((s) => s.deleteBuild);
  const triggerRelease = useAdminConsole((s) => s.triggerRelease);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadBuilds();
  }, [loadBuilds]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="text-xs text-ink-faint max-w-sm">
          Installers uploaded by the release pipeline to the public "builds" bucket, and the landing page's
          Download links point here.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" className="text-xs" onClick={() => loadBuilds()} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            className="text-xs"
            disabled={busy}
            onClick={async () => {
              setMsg(null);
              setErr(null);
              try {
                await triggerRelease();
                setMsg("Windows release build triggered — it takes ~10-15 min, then uploads automatically.");
              } catch (e: any) {
                setErr(e?.message ?? "Failed to trigger release");
              }
            }}
          >
            <Rocket className="h-3.5 w-3.5" /> Trigger Windows build
          </Button>
        </div>
      </div>

      {(msg || err) && (
        <p
          className={`mb-4 text-sm rounded-lg px-3 py-2 border ${
            msg ? "text-emerald-700 bg-emerald-50 border-emerald-100" : "text-red-600 bg-red-50 border-red-100"
          }`}
        >
          {msg ?? err}
        </p>
      )}

      {busy && !builds.length ? (
        <div className="flex items-center gap-2 text-sm text-ink-faint py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading builds…
        </div>
      ) : builds.length === 0 ? (
        <p className="text-sm text-ink-faint py-8">No builds uploaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {builds.map((b) => (
            <div key={b.name} className="rounded-lg border border-line px-4 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-ink truncate">{b.name}</p>
                <p className="text-[11px] text-ink-faint mt-0.5">
                  {formatBytes(b.size_bytes)} · uploaded {relativeDate(b.created_at)}
                </p>
              </div>
              <a
                href={publicBuildUrl(b.name)}
                target="_blank"
                rel="noreferrer"
                className="text-ink-faint hover:text-ink shrink-0"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
              <Button
                variant="ghost"
                className="text-xs px-2 py-1 shrink-0 text-red-600 hover:bg-red-50"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete ${b.name}? The download link will stop working.`)) {
                    deleteBuild(b.name);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
