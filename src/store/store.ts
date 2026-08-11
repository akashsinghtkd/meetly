import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ActionItem, Meeting, Project, Task, TaskStatus, TranscriptSegment, View } from "../lib/types";
import { seedMeetings, seedProjects, seedTasks, SPEAKER_COLORS, PROJECT_COLORS } from "../lib/seed";
import { cloudEnabled } from "../lib/supabase";
import { persistStorage } from "../lib/persistStorage";
import { defaultSystemDevice, startRecording, stopRecording } from "../lib/tauri";
import { currentEvent } from "../lib/calendar";
import { useCalendar } from "./calendarStore";
import { startLiveSession, stopLiveSession } from "../lib/liveTranscription";
import { getSummarizer } from "../lib/providers/summarize";
import { enhanceNotes } from "../lib/providers/notes";
import { canDiarize, diarizeFile } from "../lib/providers/diarize";
import { getModel, chatCostUsd, transcriptionCostUsd } from "../lib/providers/catalog";
import { budgetStatus } from "../lib/budget";
import { teamAiAllowed, teamAiBlockMessage } from "../lib/billing/limits";
import { useSettings } from "./settingsStore";
import { useCost } from "./costStore";

let segSeq = 0;
let speakerSeq = 0;
let idSeq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${idSeq++}`;

const GENERIC_SPEAKER = /^(me|them|speaker \d+|speaker [a-z])$/i;

/** Participants = the human-named speakers (drop "Me" and un-renamed placeholders). */
function deriveParticipants(speakers: { displayName: string }[]): string[] {
  const names = speakers
    .map((s) => s.displayName.trim())
    .filter((n) => n && n.toLowerCase() !== "me" && !GENERIC_SPEAKER.test(n));
  return [...new Set(names)];
}

interface RecordingState {
  active: boolean;
  meetingId: string | null;
  startedAt: number | null;
  elapsedSecs: number;
  /** True when the call's other side is being captured too, not just the mic. */
  systemActive: boolean;
}

interface AppState {
  meetings: Meeting[];
  projects: Project[];
  tasks: Task[];
  view: View;
  recording: RecordingState;
  micDevice: string | null;
  systemDevice: string | null;

  notice: string | null;

  // navigation
  setView: (view: View) => void;
  openMeeting: (id: string) => void;
  openProject: (id: string, tab?: "overview" | "meetings" | "tasks") => void;
  setNotice: (notice: string | null) => void;

  // projects
  newProjectOpen: boolean;
  setNewProjectOpen: (open: boolean) => void;
  addProject: (details?: { name?: string; emoji?: string; color?: string; description?: string }) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  renameProject: (id: string, name: string) => void;
  setProjectEmoji: (id: string, emoji: string) => void;
  deleteProject: (id: string) => void;
  assignMeetingToProject: (meetingId: string, projectId: string | null) => void;

  // tasks
  addTask: (projectId: string | null, title: string, status?: TaskStatus) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  deleteTask: (id: string) => void;
  syncTasksFromMeeting: (meetingId: string) => void;

  // meeting mutations
  updateMeeting: (id: string, patch: Partial<Meeting>) => void;
  addSegment: (meetingId: string, seg: Omit<TranscriptSegment, "id">) => void;
  setMeetingError: (meetingId: string, error: string) => void;

  // speakers
  renameSpeaker: (meetingId: string, speakerId: string, displayName: string) => void;
  addSpeaker: (meetingId: string) => void;
  setSegmentSpeaker: (meetingId: string, segmentId: string, speakerId: string) => void;
  diarizeSpeakers: (meetingId: string) => void;

  toggleActionItem: (meetingId: string, itemId: string) => void;
  addActionItem: (meetingId: string) => void;
  updateActionItem: (meetingId: string, itemId: string, patch: Partial<ActionItem>) => void;
  deleteMeeting: (id: string) => void;

  // devices
  setDevices: (mic: string | null, system: string | null) => void;

  // recording lifecycle
  startMeeting: (projectId?: string, opts?: { micOnly?: boolean }) => Promise<void>;
  enrichFromCalendar: (meetingId: string) => Promise<void>;
  stopMeeting: () => Promise<void>;
  summarizeMeeting: (meetingId: string) => Promise<void>;
  enhanceMeeting: (meetingId: string) => Promise<void>;
  // notepad
  setMeetingNotes: (meetingId: string, notes: string) => void;
  enhanceNotesFor: (meetingId: string) => Promise<void>;
  notesBusy: string | null;
  tickElapsed: () => void;
}

function newMeeting(): Meeting {
  const now = new Date().toISOString();
  const id = `m-${Date.now().toString(36)}`;
  return {
    id,
    title: "Untitled meeting",
    emoji: "🎙️",
    startedAt: now,
    durationSecs: 0,
    status: "recording",
    participants: [],
    speakers: [
      { id: "me", label: "Me", displayName: "Me", color: SPEAKER_COLORS[0] },
      { id: "them", label: "Them", displayName: "Them", color: SPEAKER_COLORS[1] },
    ],
    transcript: [],
    actionItems: [],
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
  meetings: cloudEnabled() ? [] : seedMeetings,
  projects: cloudEnabled() ? [] : seedProjects,
  tasks: cloudEnabled() ? [] : seedTasks,
  view: { kind: "all-meetings" },
  recording: { active: false, meetingId: null, startedAt: null, elapsedSecs: 0, systemActive: false },
  micDevice: null,
  systemDevice: null,
  notice: null,
  notesBusy: null,

  setView: (view) => set({ view }),
  openMeeting: (id) => set({ view: { kind: "meeting", id } }),
  openProject: (id, tab = "overview") => set({ view: { kind: "project", id, tab } }),
  setNotice: (notice) => set({ notice }),

  newProjectOpen: false,
  setNewProjectOpen: (open) => set({ newProjectOpen: open }),

  addProject: (details) => {
    const id = uid("p");
    const n = get().projects.length;
    const project: Project = {
      id,
      name: details?.name?.trim() || "Untitled project",
      emoji: details?.emoji || "📁",
      color: details?.color || PROJECT_COLORS[n % PROJECT_COLORS.length],
      description: details?.description?.trim() || undefined,
    };
    set((s) => ({ projects: [...s.projects, project] }));
    return id;
  },

  updateProject: (id, patch) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  renameProject: (id, name) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name: name || "Untitled" } : p)),
    })),

  setProjectEmoji: (id, emoji) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, emoji } : p)) })),

  deleteProject: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      // Unassign its meetings; drop its tasks.
      meetings: s.meetings.map((m) => (m.projectId === id ? { ...m, projectId: null } : m)),
      tasks: s.tasks.filter((t) => t.projectId !== id),
      view: s.view.kind === "project" && s.view.id === id ? { kind: "all-meetings" } : s.view,
    })),

  assignMeetingToProject: (meetingId, projectId) => {
    set((s) => ({
      meetings: s.meetings.map((m) => (m.id === meetingId ? { ...m, projectId } : m)),
      // Move this meeting's auto-created tasks along with it (or drop if unassigned).
      tasks:
        projectId === null
          ? s.tasks.filter((t) => t.sourceMeetingId !== meetingId)
          : s.tasks.map((t) => (t.sourceMeetingId === meetingId ? { ...t, projectId } : t)),
    }));
    if (projectId) get().syncTasksFromMeeting(meetingId);
  },

  addTask: (projectId, title, status = "not_started") =>
    set((s) => ({
      tasks: [...s.tasks, { id: uid("t"), projectId: projectId ?? null, title, status }],
    })),

  updateTask: (id, patch) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  moveTask: (id, status) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)) })),

  deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

  // Auto-flow: every action item of a project-assigned meeting becomes a task
  // (deduped by sourceActionItemId), linked back to its meeting.
  syncTasksFromMeeting: (meetingId) =>
    set((s) => {
      const m = s.meetings.find((mm) => mm.id === meetingId);
      if (!m || !m.projectId) return s;
      const existing = new Set(
        s.tasks.filter((t) => t.sourceActionItemId).map((t) => t.sourceActionItemId),
      );
      const newTasks: Task[] = m.actionItems
        .filter((a) => a.task.trim() && !existing.has(a.id))
        .map((a) => ({
          id: uid("t"),
          projectId: m.projectId!,
          title: a.task,
          status: a.status === "done" ? ("done" as const) : ("not_started" as const),
          owner: a.owner || undefined,
          due: a.due,
          sourceMeetingId: m.id,
          sourceActionItemId: a.id,
        }));
      return newTasks.length ? { tasks: [...s.tasks, ...newTasks] } : s;
    }),

  updateMeeting: (id, patch) =>
    set((s) => ({
      meetings: s.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  addSegment: (meetingId, seg) =>
    set((s) => ({
      meetings: s.meetings.map((m) =>
        m.id !== meetingId
          ? m
          : {
              ...m,
              transcript: [...m.transcript, { ...seg, id: `t-${segSeq++}` }].sort(
                (a, b) => a.tStart - b.tStart,
              ),
            },
      ),
    })),

  setMeetingError: (meetingId, error) =>
    set((s) => ({
      meetings: s.meetings.map((m) => (m.id === meetingId ? { ...m, error } : m)),
    })),

  renameSpeaker: (meetingId, speakerId, displayName) =>
    set((s) => ({
      meetings: s.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const speakers = m.speakers.map((sp) =>
          sp.id === speakerId ? { ...sp, displayName: displayName || sp.label } : sp,
        );
        return { ...m, speakers, participants: deriveParticipants(speakers) };
      }),
    })),

  addSpeaker: (meetingId) =>
    set((s) => ({
      meetings: s.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const n = m.speakers.length + 1;
        const label = `Speaker ${n}`;
        const speaker = {
          id: `sp-${speakerSeq++}`,
          label,
          displayName: label,
          color: SPEAKER_COLORS[m.speakers.length % SPEAKER_COLORS.length],
        };
        return { ...m, speakers: [...m.speakers, speaker] };
      }),
    })),

  setSegmentSpeaker: (meetingId, segmentId, speakerId) =>
    set((s) => ({
      meetings: s.meetings.map((m) =>
        m.id !== meetingId
          ? m
          : {
              ...m,
              transcript: m.transcript.map((seg) =>
                seg.id === segmentId ? { ...seg, speakerId } : seg,
              ),
            },
      ),
    })),

  // Heuristic auto-split of the remote ("Them") channel into multiple speakers by
  // pause length. This is a placeholder for real acoustic diarization
  // (AssemblyAI / Deepgram / pyannote), which plugs in as a provider later.
  diarizeSpeakers: (meetingId) =>
    set((s) => ({
      meetings: s.meetings.map((m) => {
        if (m.id !== meetingId) return m;
        const GAP = 2.0; // seconds of silence that may indicate a speaker change
        const MAX_REMOTE = 3;
        const remote = m.transcript
          .filter((seg) => seg.channel === "system")
          .sort((a, b) => a.tStart - b.tStart);
        if (remote.length === 0) return m;

        // Build up to MAX_REMOTE remote speakers.
        const remoteSpeakers = Array.from({ length: MAX_REMOTE }, (_, i) => ({
          id: `sp-r${i}`,
          label: `Speaker ${i + 2}`,
          displayName: `Speaker ${i + 2}`,
          color: SPEAKER_COLORS[(i + 1) % SPEAKER_COLORS.length],
        }));

        let idx = 0;
        let prevEnd = remote[0].tStart;
        const assignment = new Map<string, string>();
        for (const seg of remote) {
          if (seg.tStart - prevEnd > GAP) idx = (idx + 1) % MAX_REMOTE;
          assignment.set(seg.id, remoteSpeakers[idx].id);
          prevEnd = seg.tEnd;
        }

        const usedIds = new Set(assignment.values());
        const speakers = [
          ...m.speakers.filter((sp) => sp.id === "me" || sp.id === "them"),
          ...remoteSpeakers.filter((sp) => usedIds.has(sp.id)),
        ];
        const transcript = m.transcript.map((seg) =>
          assignment.has(seg.id) ? { ...seg, speakerId: assignment.get(seg.id)! } : seg,
        );
        return { ...m, speakers, transcript, participants: deriveParticipants(speakers) };
      }),
    })),

  toggleActionItem: (meetingId, itemId) =>
    set((s) => ({
      meetings: s.meetings.map((m) =>
        m.id !== meetingId
          ? m
          : {
              ...m,
              actionItems: m.actionItems.map((a) =>
                a.id === itemId ? { ...a, status: a.status === "done" ? "open" : "done" } : a,
              ),
            },
      ),
    })),

  addActionItem: (meetingId) =>
    set((s) => ({
      meetings: s.meetings.map((m) =>
        m.id !== meetingId
          ? m
          : {
              ...m,
              actionItems: [
                ...m.actionItems,
                { id: `a-${Date.now().toString(36)}`, owner: "", task: "", status: "open" },
              ],
            },
      ),
    })),

  updateActionItem: (meetingId, itemId, patch) =>
    set((s) => ({
      meetings: s.meetings.map((m) =>
        m.id !== meetingId
          ? m
          : {
              ...m,
              actionItems: m.actionItems.map((a) => (a.id === itemId ? { ...a, ...patch } : a)),
            },
      ),
    })),

  deleteMeeting: (id) =>
    set((s) => ({
      meetings: s.meetings.filter((m) => m.id !== id),
      view: s.view.kind === "meeting" && s.view.id === id ? { kind: "all-meetings" } : s.view,
    })),

  setDevices: (mic, system) => set({ micDevice: mic, systemDevice: system }),

  startMeeting: async (projectId, opts) => {
    if (budgetStatus().blocked) {
      set({
        notice: "Monthly budget reached — increase or turn off the spending cap in Settings to record.",
      });
      return;
    }
    if (!teamAiAllowed()) {
      set({ notice: teamAiBlockMessage() });
      return;
    }
    const meeting = { ...newMeeting(), projectId: projectId ?? null };
    set((s) => ({
      meetings: [meeting, ...s.meetings],
      view: { kind: "meeting", id: meeting.id },
      recording: { active: true, meetingId: meeting.id, startedAt: Date.now(), elapsedSecs: 0, systemActive: false },
    }));
    try {
      // Overlay "mic only" captures just the microphone (no system audio channel).
      // Otherwise fall back to the built-in system tap, so "record the meeting"
      // means everyone on the call and not just this side of it.
      const systemDevice = opts?.micOnly
        ? null
        : get().systemDevice ?? (await defaultSystemDevice());
      await startRecording(meeting.id, get().micDevice, systemDevice);
      set((s) => ({ recording: { ...s.recording, systemActive: Boolean(systemDevice) } }));
    } catch (e) {
      console.error("startRecording failed:", e);
    }
    // Begin live transcription (real chunk events in the app; mock timer in browser).
    startLiveSession(meeting.id);
    // Enrich from the calendar in the background so recording stays instant:
    // borrow the current event's title and attendee roster (the roster gives
    // speaker-naming a real head start instead of guessing from scratch).
    get().enrichFromCalendar(meeting.id);
  },

  enrichFromCalendar: async (meetingId) => {
    try {
      await useCalendar.getState().refresh();
      const ev = currentEvent(useCalendar.getState().events);
      if (!ev) return;
      const m = get().meetings.find((x) => x.id === meetingId);
      if (!m) return;
      const patch: Partial<Meeting> = {};
      // Only take the calendar title if the user hasn't titled it themselves.
      if (ev.title.trim() && (!m.title.trim() || m.title === "Untitled meeting")) {
        patch.title = ev.title.trim();
      }
      if (ev.attendees.length) {
        patch.attendees = ev.attendees;
        // Show the invitees right away; transcription later refines to who spoke.
        if (m.participants.length === 0) patch.participants = ev.attendees;
      }
      if (Object.keys(patch).length) get().updateMeeting(meetingId, patch);
    } catch (e) {
      console.error("[calendar] enrich failed:", e);
    }
  },

  stopMeeting: async () => {
    const { recording } = get();
    if (!recording.meetingId) return;
    const id = recording.meetingId;
    let result: import("../lib/types").RecordingResult | undefined;
    try {
      result = await stopRecording();
    } catch (e) {
      console.error("stopRecording failed:", e);
    }
    // Keep the transcription listener alive briefly so the final chunk(s)
    // emitted during stop are still captured, then tear it down and generate notes.
    setTimeout(() => stopLiveSession(), 1500);
    set((s) => ({
      recording: { active: false, meetingId: null, startedAt: null, elapsedSecs: 0, systemActive: false },
      meetings: s.meetings.map((m) =>
        m.id !== id
          ? m
          : {
              ...m,
              status: "processing",
              endedAt: new Date().toISOString(),
              durationSecs: result?.duration_secs ?? recording.elapsedSecs,
              micPath: result?.mic_path ?? undefined,
              systemPath: result?.system_path ?? undefined,
            },
      ),
    }));
    // Give the final transcription chunks time to land, then (if we can) run the
    // accurate diarized re-transcription, then generate notes from the result.
    setTimeout(async () => {
      if (canDiarize()) {
        try {
          await get().enhanceMeeting(id);
        } catch (e) {
          console.error("enhance failed:", e);
        }
      }
      await get().summarizeMeeting(id);
    }, 3000);
  },

  enhanceMeeting: async (meetingId) => {
    const meeting = get().meetings.find((m) => m.id === meetingId);
    if (!meeting) return;

    // Without a Deepgram key, fall back to the pause-based heuristic split.
    if (!canDiarize()) {
      get().diarizeSpeakers(meetingId);
      set({ notice: "Add a Deepgram key in Settings for accurate voice separation." });
      return;
    }

    get().updateMeeting(meetingId, { status: "processing", error: undefined });
    try {
      const speakers = [{ id: "me", label: "Me", displayName: "Me", color: SPEAKER_COLORS[0] }];
      const segments: TranscriptSegment[] = [];
      const model = getModel("deepgram", "nova-3");
      const perCallCost = model ? transcriptionCostUsd(model.pricing, meeting.durationSecs) : 0;
      const logCost = () =>
        useCost.getState().add({
          provider: "deepgram",
          model: "nova-3",
          kind: "transcription",
          meetingId,
          audioSeconds: meeting.durationSecs,
          costUsd: perCallCost,
          estimated: false,
        });

      // Microphone = you. Diarize for accurate word timing; all turns → "Me".
      if (meeting.micPath) {
        const mic = await diarizeFile(meeting.micPath);
        logCost();
        for (const seg of mic.segments) {
          if (!seg.text.trim()) continue;
          segments.push({
            id: `t-${segSeq++}`,
            speakerId: "me",
            channel: "mic",
            tStart: seg.tStart,
            tEnd: seg.tEnd,
            text: seg.text,
          });
        }
      }

      // System audio = the other participants. Real acoustic separation → each
      // distinct voice becomes its own speaker.
      if (meeting.systemPath) {
        const sys = await diarizeFile(meeting.systemPath);
        logCost();
        const speakerIdFor = new Map<number, string>();
        for (const seg of sys.segments) {
          if (!seg.text.trim()) continue;
          let sid = speakerIdFor.get(seg.speaker);
          if (!sid) {
            const n = speakerIdFor.size;
            sid = `sp-d${seg.speaker}`;
            speakerIdFor.set(seg.speaker, sid);
            speakers.push({
              id: sid,
              label: `Speaker ${n + 2}`,
              displayName: `Speaker ${n + 2}`,
              color: SPEAKER_COLORS[(n + 1) % SPEAKER_COLORS.length],
            });
          }
          segments.push({
            id: `t-${segSeq++}`,
            speakerId: sid,
            channel: "system",
            tStart: seg.tStart,
            tEnd: seg.tEnd,
            text: seg.text,
          });
        }
      }

      segments.sort((a, b) => a.tStart - b.tStart);
      get().updateMeeting(meetingId, {
        speakers,
        transcript: segments,
        participants: deriveParticipants(speakers),
        status: "ready",
        error: undefined,
      });
    } catch (e) {
      console.error("enhanceMeeting failed:", e);
      get().setMeetingError(meetingId, `Diarization failed: ${String(e)}`);
      get().updateMeeting(meetingId, { status: "ready" });
    }
  },

  summarizeMeeting: async (meetingId) => {
    const meeting = get().meetings.find((m) => m.id === meetingId);
    if (!meeting) return;

    const transcript = meeting.transcript.map((seg) => ({
      speaker: meeting.speakers.find((s) => s.id === seg.speakerId)?.displayName ?? "Speaker",
      text: seg.text,
    }));
    const summarizeCtx = {
      speakerLabels: [...new Set(meeting.speakers.map((s) => s.displayName.trim()))],
      youLabel: "Me",
      knownPeople: meeting.attendees ?? [],
    };

    if (transcript.length === 0) {
      get().updateMeeting(meetingId, { status: "ready" });
      return;
    }
    if (budgetStatus().blocked) {
      get().setMeetingError(meetingId, "Monthly budget reached — notes not generated.");
      get().updateMeeting(meetingId, { status: "ready" });
      return;
    }
    if (!teamAiAllowed()) {
      get().setMeetingError(meetingId, teamAiBlockMessage());
      get().updateMeeting(meetingId, { status: "ready" });
      return;
    }

    get().updateMeeting(meetingId, { status: "processing", error: undefined });
    try {
      const result = await getSummarizer().summarize(transcript, meeting.title, summarizeCtx);

      const settings = useSettings.getState();
      const model = getModel(settings.chatProvider, settings.chatModel);
      const costUsd = model
        ? chatCostUsd(model.pricing, result.inputTokens ?? 0, result.outputTokens ?? 0)
        : 0;
      useCost.getState().add({
        provider: settings.chatProvider,
        model: settings.chatModel,
        kind: "chat",
        meetingId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        estimated: result.estimated,
      });

      const actionItems: ActionItem[] = result.actionItems.map((a, i) => ({
        id: `a-${Date.now().toString(36)}-${i}`,
        owner: a.owner,
        task: a.task,
        due: a.due,
        urgency: a.urgency ?? "normal",
        status: "open" as const,
      }));

      // Auto-apply names the model confidently overheard, but only over speakers
      // still showing a generic placeholder — never clobber a name the user set.
      const nameByLabel = new Map(
        result.speakerNames
          .filter((s) => s.confidence === "high" && s.name.trim())
          .map((s) => [s.label.trim(), s.name.trim()]),
      );
      const renamedSpeakers = meeting.speakers.map((sp) =>
        GENERIC_SPEAKER.test(sp.displayName) && nameByLabel.has(sp.displayName)
          ? { ...sp, displayName: nameByLabel.get(sp.displayName)! }
          : sp,
      );

      get().updateMeeting(meetingId, {
        summary: result.summary,
        actionItems,
        speakers: renamedSpeakers,
        participants: deriveParticipants(renamedSpeakers),
        status: "ready",
      });
      // Auto-flow action items → the project's task board.
      get().syncTasksFromMeeting(meetingId);
    } catch (e) {
      console.error("summarize failed:", e);
      get().setMeetingError(meetingId, String(e));
      get().updateMeeting(meetingId, { status: "ready" });
    }
  },

  setMeetingNotes: (meetingId, notes) => get().updateMeeting(meetingId, { notes }),

  enhanceNotesFor: async (meetingId) => {
    const meeting = get().meetings.find((m) => m.id === meetingId);
    if (!meeting) return;
    const raw = (meeting.notes ?? "").trim();
    if (!raw) return;
    if (budgetStatus().blocked) {
      get().setNotice("Monthly budget reached — raise the cap in Settings to enhance notes.");
      return;
    }
    if (!teamAiAllowed()) {
      get().setNotice(teamAiBlockMessage());
      return;
    }

    set({ notesBusy: meetingId });
    try {
      const result = await enhanceNotes(meeting, raw);

      const settings = useSettings.getState();
      const model = getModel(settings.chatProvider, settings.chatModel);
      const costUsd = model
        ? chatCostUsd(model.pricing, result.inputTokens ?? 0, result.outputTokens ?? 0)
        : 0;
      useCost.getState().add({
        provider: settings.chatProvider,
        model: settings.chatModel,
        kind: "chat",
        meetingId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        estimated: result.estimated,
      });

      get().updateMeeting(meetingId, { notesEnhanced: result.text });
    } catch (e) {
      console.error("enhanceNotes failed:", e);
      get().setNotice("Couldn't enhance notes — check your connection or API key.");
    } finally {
      set({ notesBusy: null });
    }
  },

  tickElapsed: () =>
    set((s) => {
      if (!s.recording.active || !s.recording.startedAt) return s;
      return {
        recording: {
          ...s.recording,
          elapsedSecs: Math.floor((Date.now() - s.recording.startedAt) / 1000),
        },
      };
    }),
    }),
    {
      name: "meetly-meetings",
      // SQLite under Tauri — transcripts outgrow localStorage. See persistStorage.
      storage: createJSONStorage(() => persistStorage),
      // Persist only durable data; view/recording are transient.
      partialize: (s) => ({
        meetings: s.meetings,
        projects: s.projects,
        tasks: s.tasks,
        micDevice: s.micDevice,
        systemDevice: s.systemDevice,
      }),
      // On reload, no meeting can still be recording/processing — sanitize.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const meetings = (p.meetings ?? current.meetings).map((m) =>
          m.status === "recording" || m.status === "processing"
            ? { ...m, status: "ready" as const }
            : m,
        );
        return { ...current, ...p, meetings };
      },
    },
  ),
);
