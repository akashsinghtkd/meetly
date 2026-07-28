// Supabase client. Cloud sync is OPTIONAL — when the env vars are absent the app
// runs entirely local (no accounts, no sync), exactly as before. Set both
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to turn cloud on.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function cloudEnabled(): boolean {
  return Boolean(url && anonKey);
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    if (!cloudEnabled()) throw new Error("Supabase is not configured");
    client = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
      },
    });
  }
  return client;
}
