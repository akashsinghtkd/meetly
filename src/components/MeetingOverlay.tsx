import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, Square, X } from "lucide-react";
import { emit, listen } from "@tauri-apps/api/event";
import { availableMonitors, currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { formatClock } from "../lib/format";
import { pinOverlay } from "../lib/tauri";

const WIN_W = 508;
const WIN_H = 72; // collapsed (just the pill)
const WIN_H_OPEN = 188; // expanded to fit the dropdown
const POS_KEY = "meetly.overlay.position"; // physical px, remembered across launches

/**
 * The floating recorder pill — styled after Notion's "Start AI Meeting Note"
 * banner: a light pill with an icon, a two-line label, a blue split button and
 * a dismiss button. Lives in its own Tauri window (?overlay=1) that is pinned
 * above every other app on every Space (see src-tauri/src/overlay.rs), so it
 * stays visible over Zoom/Meet/Teams — including full screen — while recording
 * itself runs in the main window via events.
 *
 * The whole pill is a `data-tauri-drag-region`, so the user can drag it
 * anywhere on screen; wherever they drop it is remembered.
 */
export function MeetingOverlay() {
  const [recording, setRecording] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  // Transparent chrome, float above everything, restore the last drag position.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    let unlistenMoved: (() => void) | undefined;

    (async () => {
      const win = getCurrentWindow();
      await pinOverlay();
      await restorePosition();

      // Remember wherever the user drags the pill to (debounced — macOS emits a
      // move event for every frame of the drag).
      let timer: ReturnType<typeof setTimeout> | undefined;
      unlistenMoved = await win.onMoved(({ payload }) => {
        if (timer) clearTimeout(timer);
        const { x, y } = payload;
        timer = setTimeout(() => {
          try {
            localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
          } catch {
            /* private mode / quota — position just won't persist */
          }
        }, 400);
      });
    })();

    return () => unlistenMoved?.();
  }, []);

  // React to detection + recording-state broadcasts.
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    (async () => {
      unlisteners.push(
        await listen("meeting-detected", async () => {
          await getCurrentWindow().show();
          await pinOverlay();
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
        await listen<{ active: boolean; startedAt: number | null }>(
          "recording:changed",
          async (e) => {
            const active = Boolean(e.payload?.active);
            recordingRef.current = active;
            startedAtRef.current = active ? e.payload?.startedAt ?? Date.now() : null;
            setRecording(active);
            if (active) {
              setMenuOpen(false);
              await collapse();
              await getCurrentWindow().show();
              await pinOverlay();
            }
          },
        ),
      );
    })();
    return () => unlisteners.forEach((u) => u());
  }, []);

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
  /** Hide the pill for this call. Recording (if any) keeps running. */
  const dismiss = async () => {
    await collapse();
    await getCurrentWindow().hide();
  };

  return (
    <div className="h-screen w-screen flex flex-col items-stretch p-1 bg-transparent select-none">
      <div
        data-tauri-drag-region
        title="Drag to move"
        className="flex items-center gap-3 rounded-[24px] bg-white border border-black/[0.06] pl-3 pr-1.5 py-1.5 shadow-panel cursor-grab active:cursor-grabbing"
      >
        {recording ? (
          <>
            <span
              data-tauri-drag-region
              className="grid place-items-center h-9 w-9 rounded-xl bg-neutral-900 shrink-0"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 recording-dot" />
            </span>
            <div data-tauri-drag-region className="min-w-0 flex-1 leading-tight">
              <div data-tauri-drag-region className="text-[15px] font-semibold text-neutral-900 truncate">
                Recording this call
              </div>
              <div data-tauri-drag-region className="text-[13px] text-neutral-500 truncate">
                <span className="tabular-nums font-medium text-neutral-700">{formatClock(elapsed)}</span>
                <span className="mx-1.5">·</span>mic only
              </div>
            </div>
            <button
              onClick={stop}
              className="flex items-center gap-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 text-sm font-semibold shrink-0 transition-colors"
            >
              <Square className="h-3 w-3 fill-current" /> Stop
            </button>
          </>
        ) : (
          <>
            <span
              data-tauri-drag-region
              className="grid place-items-center h-9 w-9 rounded-xl bg-accent text-white shrink-0"
            >
              <Mic className="h-4 w-4 fill-current" strokeWidth={0} />
            </span>
            <div data-tauri-drag-region className="min-w-0 flex-1 leading-tight">
              <div data-tauri-drag-region className="text-[15px] font-semibold text-neutral-900 truncate">
                Start AI meeting note
              </div>
              <div data-tauri-drag-region className="text-[13px] text-neutral-500 truncate">
                Records your mic · opens Meetly
              </div>
            </div>
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

      {menuOpen && !recording && (
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

/**
 * Put the pill back where the user last dragged it, falling back to top-centre
 * of the active display. A saved spot is only reused if it still lands on a
 * connected monitor — otherwise unplugging an external screen would strand the
 * pill off-screen.
 */
async function restorePosition() {
  const win = getCurrentWindow();
  try {
    const raw = localStorage.getItem(POS_KEY);
    const saved = raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const monitors = await availableMonitors();
      const onScreen = monitors.some(
        (m) =>
          saved.x >= m.position.x - 40 &&
          saved.x <= m.position.x + m.size.width - 80 &&
          saved.y >= m.position.y &&
          saved.y <= m.position.y + m.size.height - 40,
      );
      if (onScreen) {
        await win.setPosition(new PhysicalPosition(saved.x, saved.y));
        return;
      }
    }
  } catch {
    /* fall through to the default spot */
  }

  try {
    const mon = await currentMonitor();
    if (mon) {
      const x = (mon.size.width / mon.scaleFactor - WIN_W) / 2;
      await win.setPosition(new LogicalPosition(Math.max(0, x), 14));
    }
  } catch {
    /* not fatal */
  }
}

// Kept outside React state so event listeners read the latest value without
// needing to re-subscribe on every render.
const recordingRef = { current: false };
