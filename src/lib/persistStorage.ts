// Where persisted zustand state actually lives.
//
// It used to be `localStorage` on every platform, which is capped around 5 MB.
// Transcripts are the bulk of a meeting, so a heavy user hits that cap after a
// few dozen calls — and when they do the write throws `QuotaExceededError`,
// zustand swallows it, and meetings silently stop saving.
//
// Both targets now use storage without that ceiling, behind one interface:
//   * desktop (Tauri) → SQLite, see src-tauri/src/store_db.rs
//   * web             → IndexedDB
// If IndexedDB is unavailable (private mode, ancient browser) we fall back to
// localStorage and keep the old behaviour rather than losing writes entirely.

import type { StateStorage } from "zustand/middleware";
import { inTauri } from "./tauri";

/** State changes on every keystroke; don't hit storage that often. */
const WRITE_DEBOUNCE_MS = 400;

const IDB_NAME = "meetly";
const IDB_STORE = "kv";

/** The one thing each platform has to provide. */
interface Backend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// ── desktop: SQLite through Tauri commands ──────────────────────────────────

async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const sqliteBackend: Backend = {
  get: (key) => call<string | null>("store_get", { key }),
  set: (key, value) => call<void>("store_set", { key, value }),
  remove: (key) => call<void>("store_remove", { key }),
};

// ── web: IndexedDB ──────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbRequest<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode);
        const req = run(tx.objectStore(IDB_STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

const indexedDbBackend: Backend = {
  get: async (key) => (await idbRequest<string | undefined>("readonly", (s) => s.get(key))) ?? null,
  set: async (key, value) => {
    await idbRequest("readwrite", (s) => s.put(value, key));
  },
  remove: async (key) => {
    await idbRequest("readwrite", (s) => s.delete(key));
  },
};

const localStorageBackend: Backend = {
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => localStorage.setItem(key, value),
  remove: async (key) => localStorage.removeItem(key),
};

function pickBackend(): Backend {
  if (inTauri()) return sqliteBackend;
  const hasIdb = typeof indexedDB !== "undefined";
  if (!hasIdb) {
    console.warn("[meetly] IndexedDB unavailable — falling back to localStorage (5 MB cap)");
    return localStorageBackend;
  }
  return indexedDbBackend;
}

const backend = pickBackend();
/** True when we're on real storage and the localStorage import still matters. */
const migrates = backend !== localStorageBackend;

// ── shared debounce / migration layer ───────────────────────────────────────

const pending = new Map<string, string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function flushKey(key: string): Promise<void> {
  const value = pending.get(key);
  if (value === undefined) return;
  pending.delete(key);
  timers.delete(key);
  try {
    await backend.set(key, value);
  } catch (e) {
    // Put it back so the next flush retries rather than dropping the write.
    if (!pending.has(key)) pending.set(key, value);
    console.error(`[meetly] failed to persist "${key}"`, e);
  }
}

/** Write everything queued right now. Called before the window goes away. */
export async function flushPersistedState(): Promise<void> {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  await Promise.all([...pending.keys()].map(flushKey));
}

/**
 * Move a key out of localStorage, once. The original is only dropped after the
 * new copy reads back identical — a migration that loses meetings would be
 * worse than the quota bug it fixes.
 */
async function migrateFromLocalStorage(key: string): Promise<string | null> {
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (legacy === null) return null;

  try {
    await backend.set(key, legacy);
    if ((await backend.get(key)) === legacy) {
      localStorage.removeItem(key);
      console.info(`[meetly] migrated "${key}" out of localStorage`);
    }
  } catch (e) {
    // Leave localStorage untouched; we'll try again next launch.
    console.error(`[meetly] migration of "${key}" failed, keeping localStorage`, e);
  }
  return legacy;
}

export const persistStorage: StateStorage = {
  getItem: async (key) => {
    // Read-your-writes: a queued value is newer than what's stored.
    if (pending.has(key)) return pending.get(key) ?? null;
    try {
      const stored = await backend.get(key);
      if (stored !== null && stored !== undefined) return stored;
    } catch (e) {
      console.error(`[meetly] failed to read "${key}"`, e);
    }
    return migrates ? migrateFromLocalStorage(key) : null;
  },

  setItem: (key, value) => {
    pending.set(key, value);
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => void flushKey(key), WRITE_DEBOUNCE_MS),
    );
  },

  removeItem: async (key) => {
    pending.delete(key);
    const t = timers.get(key);
    if (t) clearTimeout(t);
    timers.delete(key);
    try {
      await backend.remove(key);
    } catch (e) {
      console.error(`[meetly] failed to remove "${key}"`, e);
    }
  },
};

if (typeof window !== "undefined") {
  // Best effort: the debounce window is short, but don't lose it on quit.
  const flush = () => void flushPersistedState();
  window.addEventListener("beforeunload", flush);
  window.addEventListener("pagehide", flush);
}
