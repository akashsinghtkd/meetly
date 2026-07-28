# Meetly — AI Meeting Recorder

A Notion-style desktop app that records your meetings (your mic **and** the other
participants' system audio), then transcribes and summarizes them into clean, searchable
notes with action items and cross-meeting AI chat.

Built with **Tauri 2 (Rust) + React + TypeScript + Tailwind**. See [PLAN.md](PLAN.md) for the
full phased roadmap.

---

## Why a desktop app?

Browsers can't silently capture *system audio* — the audio of the people you're on a call
with. That's the whole point of a meeting recorder, so this is a native desktop app. The
Rust core does what the browser can't (audio capture, local storage); everything else is a
normal React app running in the Tauri webview.

---

## Running it

```bash
npm install          # once
npm run app          # launches the desktop app (Tauri dev)
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run app` | Desktop app in dev (hot reload) |
| `npm run app:build` | Build a distributable `.app` / installer |
| `npm run dev` | Frontend only in the browser (UI iteration; **no audio capture**) |
| `npm run build` | Type-check + build the frontend |

**First launch (macOS):** the app will ask for **Microphone** permission. To capture the
other participants, also pick a system-audio source in **Settings** (see below).

---

## Capturing system audio (the "Them" channel)

macOS blocks apps from grabbing system audio unless you route it through a loopback device.
Two options today:

1. **BlackHole** (free): `brew install blackhole-2ch`, then in **Settings → System audio**
   pick `BlackHole 2ch`. Create a Multi-Output Device in *Audio MIDI Setup* so you still
   hear the call while it's captured.
2. **Aggregate / Loopback** device — anything that exposes system output as an input shows
   up in the device list automatically.

The zero-install path (a ScreenCaptureKit audio tap, no virtual device needed) is Phase 1b
in the plan.

Mic and system audio are recorded to **separate WAV files** on purpose — that gives a clean
"Me vs Them" split for speaker labels without any diarization model.

---

## What's built (Phase 0–3)

- ✅ Tauri 2 + React + Tailwind app shell, Notion-style UI
- ✅ Sidebar, meeting library, meeting page (editable), action items, search, settings
- ✅ AI chat panel (local retrieval stand-in)
- ✅ Rust audio capture: device enumeration + mic/system → rolling WAV **chunks** (`src-tauri/src/audio.rs`)
- ✅ **Live transcription**: each chunk fires a `transcribe-chunk` event → OpenAI (`gpt-4o-transcribe` / `whisper-1`) → transcript appears live, speaker-split by channel
- ✅ **Cost tracking everywhere**: provider catalog + pricing (`src/lib/providers/catalog.ts`), a cost ledger, USD shown in the record bar (live projection), meeting page, sidebar total, and a full Settings breakdown
- ✅ **AI notes (Phase 3)**: on stop, the transcript is sent to a chat model → structured **summary · decisions · action items · risks · open questions · next agenda** ([summarize.ts](src/lib/providers/summarize.ts)); "Generate / Regenerate" button on the meeting page. Chat cost is **token-accurate** (uses the exact tokens OpenAI returns).
- ✅ **Persistence**: meetings + transcripts survive app restarts (saved locally; recording status sanitized on reload)
- ✅ **Ask AI (Phase 6-lite)**: the chat panel now answers from your real meetings — keyword retrieval builds context → chat model → cited answer ([assistant.ts](src/lib/providers/assistant.ts)), with per-message token cost. Mock fallback with no key.
- ✅ **Speakers (Phase 5)**: rename speakers inline, add speakers, and **reassign any transcript line** to a different speaker ([Speakers.tsx](src/components/Speakers.tsx)); names flow into the participants list. "Auto-split speakers" heuristically separates the remote channel by pauses. Real acoustic diarization (AssemblyAI/Deepgram) is stubbed in the catalog as the drop-in upgrade.
- ✅ **Projects & Tasks**: group work into projects, each with a **Meetings** tab and a **Kanban Tasks board** ([ProjectPage.tsx](src/components/ProjectPage.tsx)). Record a meeting standalone and **assign it to a project later** (project picker on the meeting page; unassigned = Inbox / All meetings). **AI action items auto-flow into the project's task board** as draggable cards linked back to their source meeting.
- ✅ **Provider abstraction** ready for Gemini / Ollama (local = $0)

### Money control (best-value APIs)
- **Quality/cost presets** (Best / Balanced / Cheapest) in Settings pick the transcription + notes models for you, each showing an estimated $/hour.
- **Transcription and notes choose their provider independently**, so you can mix the best value for each. **Deepgram Nova-3** is wired as the cheap, high-quality, diarization-capable transcription option ([transcribe.rs](src-tauri/src/transcribe.rs)); OpenAI stays the default.
- **Monthly budget** with a live progress bar and an optional **hard stop** that blocks recording, transcription, and AI once the cap is hit ([budget.ts](src/lib/budget.ts)). Only real (billed) calls count toward it.

### Transcription & cost — how it works
- HTTP runs in **Rust** (`src-tauri/src/transcribe.rs`, reqwest multipart) to avoid browser CORS and keep the API key out of the webview.
- With **no API key** (or in browser preview), a **mock transcriber** feeds the live UI so the flow is demoable; those costs are flagged **estimated**.
- Real usage (tokens / audio-seconds) is captured from the API response; USD = `usage × catalog rate`. **Catalog prices are editable estimates — verify against the provider's pricing page.**

- ✅ **Cloud sync + accounts (optional)**: connect a **Supabase** project to sync meetings/projects/tasks/cost across devices and unlock the **web app** (same UI, recording auto-disabled in the browser). Local-first — the app works fully offline and syncs up. Setup in [SETUP.md](SETUP.md); leave it unconfigured to stay 100% local.

## Platforms
- **macOS desktop** — full (record + everything). ✅
- **Windows desktop** — builds from the same Tauri codebase; mic capture works, system-audio (WASAPI loopback) still to add.
- **Web app** — same React frontend, view/manage only (no recording), reads synced cloud data.

## What's next (see PLAN.md)

- ⬜ Phase 4: upgrade local persistence → SQLite + semantic (embedding) search
- ⬜ Phase 5 (full): real acoustic diarization via AssemblyAI/Deepgram (beyond channel split + heuristic)
- ⬜ Phase 6 (full): upgrade Ask AI retrieval from keyword → semantic (embeddings) + cross-meeting memory
- ⬜ Phase 7: polish, integrations, signed/notarized installer
- ⬜ Providers: wire Gemini + Ollama into the existing abstraction

---

## Project layout

```
src/                     React frontend
  components/            Sidebar, MeetingList, MeetingPage, RecordBar, AIChatPanel, …
  store/store.ts         Zustand app state + recording lifecycle
  lib/tauri.ts           Typed wrappers around Tauri commands (browser-safe)
  lib/types.ts           Domain model (mirrors the DB schema in PLAN.md)
src-tauri/
  src/audio.rs           cpal capture → WAV (mic + system loopback)
  src/lib.rs             Tauri commands: list_audio_devices, start/stop_recording
  tauri.conf.json        Window + bundle config
  Info.plist             macOS mic / screen-capture usage descriptions
```
