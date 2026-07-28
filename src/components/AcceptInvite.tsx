import { useEffect, useState } from "react";
import { Check, Loader2, Users } from "lucide-react";
import { useTeamspace } from "../store/teamspaceStore";
import { BrandMark, Button } from "./ui";

export function AcceptInvite({ token, onDone }: { token: string; onDone: () => void }) {
  const acceptInvite = useTeamspace((s) => s.acceptInvite);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ts = await acceptInvite(token);
        if (!cancelled) {
          setName(ts.name);
          setBusy(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Could not accept invite");
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, acceptInvite]);

  return (
    <div className="h-screen w-screen grid place-items-center bg-surface-sidebar px-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-surface p-6 shadow-sm text-center">
        <div className="flex justify-center mb-4">
          <BrandMark size="lg" />
        </div>
        {busy && (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-accent mx-auto mb-3" />
            <p className="text-sm text-ink-light">Joining teamspace…</p>
          </>
        )}
        {!busy && error && (
          <>
            <p className="text-ink font-semibold mb-1">Invite problem</p>
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <Button variant="secondary" onClick={onDone}>
              Continue
            </Button>
          </>
        )}
        {!busy && !error && name && (
          <>
            <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center">
              <Check className="h-5 w-5" />
            </div>
            <p className="text-ink font-semibold mb-1">You’re in</p>
            <p className="text-sm text-ink-light mb-4 inline-flex items-center gap-1.5 justify-center">
              <Users className="h-4 w-4" /> Joined <span className="font-medium text-ink">{name}</span>
            </p>
            <Button onClick={onDone}>Open workspace</Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Read ?invite=TOKEN from the URL (and strip it after). */
export function readInviteToken(): string | null {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("invite");
  } catch {
    return null;
  }
}

export function clearInviteToken() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has("invite")) return;
    u.searchParams.delete("invite");
    window.history.replaceState({}, "", u.pathname + u.search + u.hash);
  } catch {
    /* ignore */
  }
}
