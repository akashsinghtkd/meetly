import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { cloudEnabled, supabase } from "../lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  ready: boolean;
  busy: boolean;
  error: string | null;

  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Make sure the client has an access token before privileged calls. */
  ensureSession: () => Promise<Session>;
}

let authListenerBound = false;

function applySession(
  set: (partial: Partial<AuthState>) => void,
  session: Session | null,
  extra?: Partial<AuthState>,
) {
  set({
    session,
    user: session?.user ?? null,
    ...extra,
  });
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  user: null,
  ready: !cloudEnabled(),
  busy: false,
  error: null,

  init: async () => {
    if (!cloudEnabled()) {
      set({ ready: true });
      return;
    }
    const sb = supabase();

    // Bind the listener BEFORE reading the session so we never miss the initial
    // event, and only bind once (StrictMode runs effects twice in dev).
    if (!authListenerBound) {
      authListenerBound = true;
      sb.auth.onAuthStateChange((event, session) => {
        // Ignore spurious nulls except real sign-out / failed recovery.
        if (!session && event !== "SIGNED_OUT" && event !== "INITIAL_SESSION") {
          return;
        }
        applySession(set, session);
      });
    }

    // Restore from storage only — do NOT signOut on transient getSession failures
    // (that was wiping good sessions and bouncing users back to Sign in). Always
    // resolve `ready` so a hiccup can't strand the app on the loading spinner.
    try {
      const { data } = await sb.auth.getSession();
      applySession(set, data.session, { error: null });
    } catch {
      /* treat as signed-out; listener will correct if a session appears */
    } finally {
      set({ ready: true });
    }
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null });
    const { data, error } = await supabase().auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    if (!data.session) {
      const msg = "Sign-in succeeded but no session was returned. Try again.";
      set({ busy: false, error: msg });
      throw new Error(msg);
    }
    applySession(set, data.session, { busy: false, error: null });
  },

  signUp: async (email, password) => {
    set({ busy: true, error: null });
    const { data, error } = await supabase().auth.signUp({ email, password });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    if (data.session) {
      applySession(set, data.session, { busy: false, error: null });
      return;
    }
    const { data: signedIn, error: signInErr } = await supabase().auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr || !signedIn.session) {
      set({
        busy: false,
        error:
          signInErr?.message ??
          "Account created, but email confirmation may be required before signing in.",
      });
      if (signInErr) throw signInErr;
      return;
    }
    applySession(set, signedIn.session, { busy: false, error: null });
  },

  signOut: async () => {
    if (cloudEnabled()) await supabase().auth.signOut();
    applySession(set, null, { error: null });
  },

  ensureSession: async () => {
    if (!cloudEnabled()) throw new Error("Cloud sync is not configured");
    const sb = supabase();

    const { data: sessData } = await sb.auth.getSession();
    let session = sessData.session;

    if (session?.access_token) {
      applySession(set, session);
      return session;
    }

    const { data: refreshed, error: refreshErr } = await sb.auth.refreshSession();
    session = refreshed.session;
    if (refreshErr || !session?.access_token) {
      // Do not wipe UI session here — let the caller show an error.
      // Wiping caused an instant bounce to the login screen after create.
      throw new Error("Your session expired. Please sign in again.");
    }
    applySession(set, session);
    return session;
  },
}));
