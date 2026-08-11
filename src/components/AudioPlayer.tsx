import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import clsx from "clsx";
import { formatClock } from "../lib/format";
import { inTauri } from "../lib/tauri";
import type { Meeting } from "../lib/types";

const SPEEDS = [1, 1.25, 1.5, 2] as const;
const SKIP_SECS = 10;
/** Nudge the second track back in step if it drifts past this. */
const SYNC_TOLERANCE = 0.25;

export interface AudioPlayerHandle {
  /** Jump to a point in the recording and start playing. */
  seekTo: (seconds: number) => void;
}

/**
 * Turn an on-disk path into a URL the webview is allowed to load. Reads are
 * limited to the recordings folder by `assetProtocol.scope` in tauri.conf.json.
 */
function assetUrl(path: string | undefined): string | null {
  if (!path || !inTauri()) return null;
  try {
    return convertFileSrc(path);
  } catch {
    return null;
  }
}

/**
 * Playback for a recorded meeting.
 *
 * The app has always written WAVs to disk but never let anyone hear them — so
 * a wrong transcript line could not be checked against what was actually said.
 *
 * Mic and system audio are captured as separate files (that separation is what
 * gives the "Me vs Them" labels), so playback runs two elements at once: the
 * mic track leads, and the system track is nudged back into step whenever it
 * drifts. One transport drives both.
 */
export const AudioPlayer = forwardRef<AudioPlayerHandle, {
  meeting: Meeting;
  /** Reported ~2×/sec so the transcript can highlight the current line. */
  onTime?: (seconds: number) => void;
}>(function AudioPlayer({ meeting, onTime }, ref) {
  const micRef = useRef<HTMLAudioElement>(null);
  const sysRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(meeting.durationSecs || 0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [failed, setFailed] = useState(false);

  const micUrl = assetUrl(meeting.micPath);
  const sysUrl = assetUrl(meeting.systemPath);

  const seekTo = useCallback((seconds: number) => {
    const mic = micRef.current;
    if (!mic) return;
    const t = Math.max(0, seconds);
    mic.currentTime = t;
    if (sysRef.current) sysRef.current.currentTime = t;
    setCurrent(t);
    void mic.play().catch(() => setFailed(true));
  }, []);

  useImperativeHandle(ref, () => ({ seekTo }), [seekTo]);

  // Keep both elements on the same clock and playback rate.
  useEffect(() => {
    const mic = micRef.current;
    if (mic) mic.playbackRate = speed;
    if (sysRef.current) sysRef.current.playbackRate = speed;
  }, [speed]);

  const toggle = () => {
    const mic = micRef.current;
    if (!mic) return;
    if (mic.paused) {
      void mic.play().catch(() => setFailed(true));
      if (sysRef.current) {
        sysRef.current.currentTime = mic.currentTime;
        void sysRef.current.play().catch(() => {});
      }
    } else {
      mic.pause();
      sysRef.current?.pause();
    }
  };

  const skip = (delta: number) => seekTo((micRef.current?.currentTime ?? 0) + delta);

  // Throttle the time reporting: a long transcript re-rendering 60×/sec for a
  // highlight is not worth it.
  const lastReport = useRef(0);
  const handleTimeUpdate = () => {
    const mic = micRef.current;
    if (!mic) return;
    setCurrent(mic.currentTime);

    const sys = sysRef.current;
    if (sys && !sys.paused && Math.abs(sys.currentTime - mic.currentTime) > SYNC_TOLERANCE) {
      sys.currentTime = mic.currentTime;
    }

    const now = performance.now();
    if (onTime && now - lastReport.current > 500) {
      lastReport.current = now;
      onTime(mic.currentTime);
    }
  };

  if (!micUrl) return null;

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="rounded-xl border border-line bg-surface-sidebar/50 p-3">
      <audio
        ref={micRef}
        src={micUrl}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          sysRef.current?.pause();
        }}
        onError={() => setFailed(true)}
      />
      {sysUrl && <audio ref={sysRef} src={sysUrl} preload="metadata" muted={false} />}

      {failed ? (
        <p className="text-xs text-ink-faint">
          The audio file for this meeting is missing or unreadable.
        </p>
      ) : (
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-accent hover:bg-accent-hover text-white transition-colors"
          >
            {playing ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current translate-x-[1px]" />
            )}
          </button>

          <button
            onClick={() => skip(-SKIP_SECS)}
            title={`Back ${SKIP_SECS}s`}
            className="text-ink-faint hover:text-ink shrink-0 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => skip(SKIP_SECS)}
            title={`Forward ${SKIP_SECS}s`}
            className="text-ink-faint hover:text-ink shrink-0 transition-colors"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="text-[11px] text-ink-faint tabular-nums shrink-0">
              {formatClock(Math.floor(current))}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="Seek"
              className="min-w-0 flex-1 h-1 appearance-none rounded-full bg-surface-active accent-accent cursor-pointer"
              style={{
                background: `linear-gradient(to right, rgb(var(--accent)) ${pct}%, rgb(var(--surface-active)) ${pct}%)`,
              }}
            />
            <span className="text-[11px] text-ink-faint tabular-nums shrink-0">
              {formatClock(Math.floor(duration))}
            </span>
          </div>

          <button
            onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
            title="Playback speed"
            className={clsx(
              "shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums transition-colors",
              speed === 1
                ? "text-ink-faint hover:bg-surface-active/60"
                : "bg-surface-active text-ink-light",
            )}
          >
            {speed}×
          </button>
        </div>
      )}
    </div>
  );
});
