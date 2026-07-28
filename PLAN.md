# AI Meeting Recorder — Build Plan

A Notion-style AI meeting-notes desktop app: silently records a call (your mic + everyone
else's system audio), transcribes it live, and produces summaries, decisions, action items,
searchable history, and cross-meeting AI chat.

**Chosen stack (from your answers):** Tauri desktop · full-featured · OpenAI transcription.

---

## 0. The one big architectural decision (resolved)

You need a **desktop app**, not a pure web app. Browsers cannot silently capture *system
audio* (the other participants), which is the whole point. Tauri is the right pick.

**Recommended shape — thin native shell + web backend:**

```
┌─────────────────────────────────────────────────────────┐
│  Tauri Desktop App                                        │
│  ┌───────────────────────┐   ┌────────────────────────┐  │
│  │ Rust core (native)     │   │ React UI (webview)      │  │
│  │ • mic capture          │   │ • meeting list / editor │  │
│  │ • SYSTEM AUDIO capture │◄─►│ • live transcript       │  │
│  │ • VAD + chunking       │   │ • summaries / chat      │  │
│  │ • local SQLite         │   │ • search                │  │
│  └──────────┬─────────────┘   └────────────────────────┘  │
└─────────────┼─────────────────────────────────────────────┘
              │ audio chunks / transcript
              ▼
   ┌─────────────────────────┐        ┌──────────────────┐
   │ Backend API (Next.js on  │───────►│ OpenAI           │
   │ Vercel) — optional cloud │        │ • transcribe     │
   │ • STT orchestration      │        │ • gpt (summary/  │
   │ • AI processing          │        │   chat)          │
   │ • embeddings + search    │        │ • embeddings     │
   │ • sync across devices    │        └──────────────────┘
   └─────────────────────────┘
```

Keep as much logic as possible in the web/React + API layer so it's easy to iterate; the
Rust side does only what browsers can't (capture + local storage + hotkeys).
**Local-first:** everything works offline against SQLite; cloud sync is optional.

---

## 1. Honest caveat about OpenAI + speaker diarization

You picked **OpenAI transcribe** (`gpt-4o-transcribe` / `gpt-4o-mini-transcribe`). It's
excellent for accuracy and supports low-latency streaming — **but it does not do speaker
diarization** ("who said what"). Full-featured means you asked for speaker labels.

Three ways to handle this (pick per-milestone, doesn't block the MVP):

1. **Channel separation (free, recommended first):** record mic on one channel, system
   audio on another. That already gives you a clean "Me" vs "Them" split with zero extra
   cost — covers most of the value.
2. **Add a diarization pass:** run the recording through a diarizer (AssemblyAI or Deepgram
   diarization, or self-hosted `pyannote`) and align its speaker turns to OpenAI's words.
3. **Switch STT for meetings with 3+ speakers** to AssemblyAI/Deepgram, keep OpenAI for
   summary/chat/embeddings.

Plan builds channel-based labels first, adds a diarization pass in Phase 5.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Desktop shell | **Tauri 2** (Rust) | small binary, native audio, auto-updater |
| UI | **React + Vite + TypeScript**, Tailwind, shadcn/ui | runs in Tauri webview |
| Audio capture | Rust `cpal` (mic) + platform loopback (system audio) | see §3 |
| VAD | `webrtc-vad` / Silero (onnx) | drop silence, chunk on pauses |
| Local DB | **SQLite** (`sqlx`/`rusqlite`) + `sqlite-vec` for vector search | local-first |
| Backend (optional) | **Next.js (App Router) on Vercel**, AI SDK v6 | STT orchestration, AI, sync |
| STT | **OpenAI** `gpt-4o-transcribe` (streaming) | +diarization pass later |
| LLM | **OpenAI GPT** via AI SDK (swappable to Gemini/Claude) | summaries, chat |
| Embeddings | OpenAI `text-embedding-3-small` | semantic search + RAG chat |
| Cloud storage | Vercel Blob / S3 / R2 (optional) | store audio if syncing |
| Auth (if cloud) | Clerk (Vercel Marketplace) | only needed for multi-device |

**Prereq not yet installed:** the Rust toolchain (`rustup`) — required for Tauri. Node 20 ✅ present.

---

## 3. System-audio capture — the hard part (per-OS)

This is the riskiest piece; prototype it first.

| OS | How to capture system audio | Effort |
|---|---|---|
| **macOS** | Core Audio tap (macOS 14.4+ `AudioHardwareCreateProcessTap`), or bundle a virtual device (BlackHole/ScreenCaptureKit audio). Needs mic + screen-recording permission. | ⭐⭐⭐⭐ |
| **Windows** | WASAPI **loopback** capture — clean, no virtual device needed. | ⭐⭐⭐ |
| **Linux** | PulseAudio/PipeWire monitor source. | ⭐⭐⭐ |

Mic + system audio are captured as **two streams**, mixed for playback/storage but kept
separate for the "Me vs Them" labels. Spike this in Phase 1 before building anything else.

---

## 4. Data model (SQLite, mirrors doc + memory/search)

```sql
meetings(id, title, started_at, ended_at, project, audio_path, status)
transcript_segments(id, meeting_id, speaker, channel, t_start, t_end, text, embedding)
summaries(id, meeting_id, executive, decisions_json, risks_json, open_questions_json, agenda_json)
action_items(id, meeting_id, owner, task, due, status, source_segment_id)
speakers(id, meeting_id, label, display_name, voice_embedding)   -- speaker mapping
meeting_links(id, from_meeting, to_meeting, reason)              -- cross-meeting memory
```

Embeddings on `transcript_segments` + `summaries` power both search and the AI chat (RAG).

---

## 5. Milestones (each is shippable)

### Phase 0 — Scaffold (½ day)
- Install `rustup`; `npm create tauri-app@latest` (React+TS+Vite template).
- Wire Tailwind + shadcn/ui; app boots with an empty meeting list.

### Phase 1 — Capture spike ⭐ riskiest, do first (2–4 days)
- Rust: capture **mic** + **system audio** on your OS → write a 2-channel WAV.
- VAD-based chunking (2–5 s chunks) emitted to the JS layer via Tauri events.
- **Exit criterion:** a real Zoom/Meet call recorded to disk with both sides audible.

### Phase 2 — Transcription pipeline (2–3 days)
- Stream chunks to OpenAI `gpt-4o-transcribe`; render **live transcript** with "Me/Them".
- Persist `transcript_segments`. Handle offline (queue) + reconnect.

### Phase 3 — AI processing (2 days)
- On meeting end, send transcript to GPT (AI SDK, structured output) →
  `summary · decisions · action_items · risks · open_questions · next_agenda` (JSON schema).
- Store; render a clean Notion-style meeting page (editable).

### Phase 4 — Storage, search, meeting library (2–3 days)
- Meeting list, full-text + **semantic search** (sqlite-vec), tags/projects.
- Export to Markdown / PDF.

### Phase 5 — Speaker diarization (2–3 days)
- Beyond channel labels: diarization pass (AssemblyAI/Deepgram or `pyannote`), align to
  OpenAI words; let user rename `Speaker A → John` (persist voice embedding to auto-match).

### Phase 6 — AI chat + cross-meeting memory ⭐ the differentiator (3–4 days)
- RAG chat over all meetings: "What did we decide?", "Who owns the API work?",
  "Summarize the last 3 meetings."
- Cross-meeting linking: surface "same issue as the April 12 sync", "John has 3 open items".

### Phase 7 — Polish & distribution (ongoing)
- Global hotkey, auto-detect meeting start, live captions overlay, tray app, auto-update.
- Integrations (opt-in): Calendar, Slack/Discord, Jira/Linear, Notion export.
- Code-sign + notarize (macOS) / sign (Windows) installers.

---

## 6. Cost & privacy notes
- **Cost driver = transcription minutes**, not the LLM. OpenAI transcribe ≈ per-audio-minute;
  budget by expected meeting hours/month. Summaries/chat are cheap by comparison.
- **Privacy:** local-first by default (audio + transcripts stay on device). Recording others
  may legally require consent — add a visible "recording" indicator and a consent setting.
- Keep API keys server-side (backend) or in the OS keychain — never bundled in the app.

---

## 7. Suggested first step
Start with **Phase 0 + Phase 1 on your OS (macOS)**. The capture spike is the only part that
can sink the project; everything after it is well-trodden. Once a call records cleanly with
both sides, the rest is a straight line.
```
# to begin:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # install Rust
npm create tauri-app@latest ai-meeting-recorder                  # React + TS template
```
