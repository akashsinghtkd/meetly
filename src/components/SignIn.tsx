import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "../store/authStore";
import { BrandMark, Button } from "./ui";

export function SignIn() {
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);
  const busy = useAuth((s) => s.busy);
  const error = useAuth((s) => s.error);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setNotice(null);
    try {
      if (mode === "in") await signIn(email.trim(), pw);
      else {
        await signUp(email.trim(), pw);
        // signUp signs the user in when the server returns a session
        if (!useAuth.getState().session) {
          setNotice("Account created. You can sign in now.");
          setMode("in");
        }
      }
    } catch {
      /* error surfaced via store */
    }
  };

  return (
    <div className="h-screen w-screen grid place-items-center bg-surface-sidebar px-4">
      <div className="w-full max-w-[380px]">
        <div className="flex flex-col items-center mb-8">
          <BrandMark size="lg" />
          <h1 className="mt-3 font-semibold text-ink text-xl tracking-tight">Meetly</h1>
          <p className="mt-1 text-sm text-ink-light text-center">
            Meeting notes that stay in sync across your devices.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
        >
          <h2 className="text-base font-semibold text-ink mb-0.5">
            {mode === "in" ? "Sign in" : "Create account"}
          </h2>
          <p className="text-sm text-ink-light mb-5">
            {mode === "in"
              ? "Same account across desktop, web, and teamspaces."
              : "Create an account, then set up your teamspace."}
          </p>

          <label className="block text-[13px] font-medium text-ink mb-1.5" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field mb-3"
            placeholder="you@example.com"
          />

          <label className="block text-[13px] font-medium text-ink mb-1.5" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="field"
            placeholder="••••••••"
          />

          {error && (
            <p className="text-sm text-red-600 mt-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-sm text-emerald-700 mt-3 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              {notice}
            </p>
          )}

          <Button
            type="submit"
            className="w-full mt-5"
            disabled={busy || !email.trim() || !pw}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "in" ? "Sign in" : "Create account"}
          </Button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setNotice(null);
            }}
            className="w-full mt-3 text-sm text-ink-light hover:text-ink"
          >
            {mode === "in" ? (
              <>
                Need an account? <span className="font-medium text-accent">Sign up</span>
              </>
            ) : (
              <>
                Have an account? <span className="font-medium text-accent">Sign in</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
