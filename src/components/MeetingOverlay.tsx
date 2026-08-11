import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, MicOff, Square, X } from "lucide-react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  currentMonitor,
  cursorPosition,
  getCurrentWindow,
  monitorFromPoint,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { formatClock } from "../lib/format";
import { pinOverlay } from "../lib/tauri";
import { dismissOverlay, micAuthorization, requestMicAccess } from "../lib/meetingDetect";

const WIN_W = 508;
const WIN_H = 72; // collapsed (just the pill)
const WIN_H_OPEN = 188; // expanded to fit the dropdown
const TOP_MARGIN = 14; // gap below the menu bar, in logical px

/**
 * The floating recorder pill — styled after Notion's "Start AI Meeting Note"
 * banner. It lives in its own Tauri window (?overlay=1) pinned above every
 * other app on every Space (see src-tauri/src/overlay.rs), so it is visible
 * over Zoom/Meet/Teams including full screen.
 *
 * It comes up whenever the microphone goes live anywhere on the system, and
 * also when we still need to ask for mic permission. Every time a meeting is
 * detected it re-centers at the top of the active display; the user can still
 * drag it aside for the current call, and the next meeting re-centers it again.
 */
export function MeetingOverlay() {
  const [recording, setRecording] = useState(false);
  const [systemActive, setSystemActive] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [asking, setAsking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  /** Park the pill at the top-center of the display the user is looking at. */
  const place = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      const mon = await activeMonitor();
      if (mon) {
        const scale = mon.scaleFactor || 1;
        const left = mon.position.x / scale;
        const top = mon.position.y / scale;
        const x = left + (mon.size.width / scale - WIN_W) / 2;
        await win.setPosition(new LogicalPosition(Math.max(left, x), top + TOP_MARGIN));
      }
    } catch {
      /* not fatal — the window just stays where it is */
    }
  }, []);

  /** Bring the pill up: show it, re-pin it, and put it on the active display. */
  const surface = useCallback(async () => {
    await getCurrentWindow().show();
    await pinOverlay();
    await place();
  }, [place]);

  // Transparent chrome and initial placement.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    (async () => {
      await pinOverlay();
      await place();

      // If we've never been granted the mic, the pill is the thing that asks.
      try {
        setNeedsPermission((await micAuthorization()) === "undetermined");
      } catch {
        /* leave it off — worst case the user starts a recording to be asked */
      }
    })();
  }, [place]);

  // React to detection, permission and recording-state broadcasts.
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    (async () => {
      unlisteners.push(await listen("meeting-detected", () => surface()));
      unlisteners.push(
        await listen("mic-permission-needed", async () => {
          setNeedsPermission(true);
          await surface();
        }),
      );
      unlisteners.push(
        await listen<boolean>("mic-permission-result", async (e) => {
          setAsking(false);
          setNeedsPermission(!e.payload);
          if (e.payload && !recordingRef.current) {
            await collapse();
            await getCurrentWindow().hide();
          }
        }),
      );
      unlisteners.push(
        await listen("meeting-ended", async () => {
          if (!recordingRef.current) {
            await collapse();
            await getCurrentWindow().hide();
          }
        }),
      );
      unlisteners.push(
        await listen<{ active: boolean; startedAt: number | null; systemActive?: boolean }>(
          "recording:changed",
          async (e) => {
            const active = Boolean(e.payload?.active);
            setSystemActive(Boolean(e.payload?.systemActive));
            recordingRef.current = active;
            startedAtRef.current = active ? e.payload?.startedAt ?? Date.now() : null;
            setRecording(active);
            if (active) {
              setMenuOpen(false);
              setNeedsPermission(false);
              await collapse();
              await surface();
            }
          },
        ),
      );
    })();
    return () => unlisteners.forEach((u) => u());
  }, [surface]);

  // Live elapsed timer while recording (ticked locally from the start time).
  useEffect(() => {
    if (!recording || !startedAtRef.current) {
      setElapsed(0);
      return;
    }
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - (startedAtRef.current as number)) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [recording]);

  async function resize(open: boolean) {
    try {
      await getCurrentWindow().setSize(new LogicalSize(WIN_W, open ? WIN_H_OPEN : WIN_H));
    } catch {
      /* ignore */
    }
  }
  async function collapse() {
    setMenuOpen(false);
    await resize(false);
  }

  const toggleMenu = async () => {
    const next = !menuOpen;
    setMenuOpen(next);
    await resize(next);
  };
  const start = async () => {
    await emit("overlay:start-recording");
    await collapse();
  };
  const startAndOpen = async () => {
    await emit("overlay:start-recording");
    await emit("overlay:open-main");
    await collapse();
  };
  const stop = () => emit("overlay:stop-recording");
  const allowMic = async () => {
    setAsking(true);
    await requestMicAccess();
  };
  /** Hide the pill for this call. Recording (if any) keeps running. */
  const dismiss = async () => {
    await collapse();
    await dismissOverlay();
  };

  return (
    <div className="h-screen w-screen flex flex-col items-stretch p-1 bg-transparent select-none">
      <div
        data-tauri-drag-region
        title="Drag to move"
        className="flex items-center gap-3 rounded-[24px] bg-white border border-black/[0.06] pl-3 pr-1.5 py-1.5 shadow-panel cursor-grab active:cursor-grabbing"
      >
        {needsPermission ? (
          <>
            <PillIcon className="bg-amber-500">
              <MicOff className="h-4 w-4" />
            </PillIcon>
            <PillText
              title="Allow microphone access"
              subtitle="Meetly needs your mic to take meeting notes"
            />
            <button
              onClick={allowMic}
              disabled={asking}
              className="rounded-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold shrink-0 transition-colors"
            >
              {asking ? "Waiting…" : "Allow"}
            </button>
          </>
        ) : recording ? (
          <>
            <PillIcon className="bg-neutral-900">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 recording-dot" />
            </PillIcon>
            <PillText
              title="Recording this call"
              subtitle={
                <>
                  <span className="tabular-nums font-medium text-neutral-700">
                    {formatClock(elapsed)}
                  </span>
                  <span className="mx-1.5">·</span>
                  {systemActive ? "mic + system audio" : "mic only"}
                </>
              }
            />
            <button
              onClick={stop}
              className="flex items-center gap-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 text-sm font-semibold shrink-0 transition-colors"
            >
              <Square className="h-3 w-3 fill-current" /> Stop
            </button>
          </>
        ) : (
          <>
            <PillIcon className="bg-accent">
              <Mic className="h-4 w-4 fill-current" strokeWidth={0} />
            </PillIcon>
            <PillText title="Start AI meeting note" subtitle="Records the whole call · opens Meetly" />
            <div className="flex items-stretch rounded-full overflow-hidden shrink-0 text-sm font-semibold">
              <button
                onClick={start}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 transition-colors"
              >
                Start recording
              </button>
              <button
                onClick={toggleMenu}
                className="bg-accent hover:bg-accent-hover text-white px-2 grid place-items-center border-l border-white/25 transition-colors"
                aria-label="More options"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
          </>
        )}

        <button
          onClick={dismiss}
          aria-label="Close"
          title="Close"
          className="grid place-items-center h-7 w-7 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 shrink-0 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {menuOpen && !recording && !needsPermission && (
        <div className="mt-1.5 ml-auto w-[260px] rounded-xl bg-white border border-black/10 shadow-panel py-1 text-sm text-neutral-800">
          <button
            onClick={startAndOpen}
            className="w-full text-left px-3 py-2 hover:bg-neutral-100 transition-colors"
          >
            Start &amp; open Meetly
          </button>
          <button
            onClick={dismiss}
            className="w-full text-left px-3 py-2 hover:bg-neutral-100 text-neutral-500 transition-colors"
          >
            Not now
          </button>
        </div>
      )}
    </div>
  );
}

/** Square badge on the left of the pill. Draggable like the rest of the bar. */
function PillIcon({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      data-tauri-drag-region
      className={`grid place-items-center h-9 w-9 rounded-xl text-white shrink-0 ${className}`}
    >
      {children}
    </span>
  );
}

/** Two-line label. Every node carries the drag attribute so the whole bar
 *  moves the window — Tauri looks at the actual event target, not the parent. */
function PillText({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <div data-tauri-drag-region className="min-w-0 flex-1 leading-tight">
      <div data-tauri-drag-region className="text-[15px] font-semibold text-neutral-900 truncate">
        {title}
      </div>
      <div data-tauri-drag-region className="text-[13px] text-neutral-500 truncate">
        {subtitle}
      </div>
    </div>
  );
}

/**
 * The display the user is actually looking at. The pointer is the best proxy —
 * `currentMonitor()` reports where the *window* is, which is stale after the
 * user moves to another screen for their call.
 */
async function activeMonitor(): Promise<Monitor | null> {
  try {
    const cursor = await cursorPosition();
    const mon = await monitorFromPoint(cursor.x, cursor.y);
    if (mon) return mon;
  } catch {
    /* fall through */
  }
  try {
    return (await currentMonitor()) ?? (await primaryMonitor());
  } catch {
    return null;
  }
}

// Kept outside React state so event listeners read the latest value without
// needing to re-subscribe on every render.
const recordingRef = { current: false };
