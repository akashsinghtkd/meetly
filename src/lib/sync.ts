// Cloud sync scoped to the active teamspace. Local Zustand stays session-
// authoritative; changes push debounced. On teamspace switch we pull that
// tenant's rows (or seed from local when cloud is empty).

import { cloudEnabled, supabase } from "./supabase";
import { useAuth } from "../store/authStore";
import { useStore } from "../store/store";
import { useCost } from "../store/costStore";
import { useTeamspace } from "../store/teamspaceStore";
import type { Meeting, Project, Task } from "./types";
import type { UsageRecord } from "../store/costStore";

const now = () => new Date().toISOString();

const projectRow = (p: Project, uid: string, ts: string) => ({
  id: p.id,
  user_id: uid,
  teamspace_id: ts,
  name: p.name,
  emoji: p.emoji,
  color: p.color,
  description: p.description ?? null,
  updated_at: now(),
});
const rowProject = (r: any): Project => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  color: r.color,
  description: r.description ?? undefined,
  teamspaceId: r.teamspace_id ?? undefined,
});

const meetingRow = (m: Meeting, uid: string, ts: string) => ({
  id: m.id,
  user_id: uid,
  teamspace_id: ts,
  title: m.title,
  emoji: m.emoji,
  project_id: m.projectId ?? null,
  started_at: m.startedAt,
  ended_at: m.endedAt ?? null,
  duration_secs: m.durationSecs,
  status: m.status === "recording" ? "ready" : m.status,
  participants: m.participants,
  speakers: m.speakers,
  transcript: m.transcript,
  summary: m.summary ?? null,
  action_items: m.actionItems,
  notes: m.notes ?? null,
  notes_enhanced: m.notesEnhanced ?? null,
  updated_at: now(),
});
const rowMeeting = (r: any): Meeting => ({
  id: r.id,
  title: r.title,
  emoji: r.emoji,
  projectId: r.project_id ?? null,
  startedAt: r.started_at,
  endedAt: r.ended_at ?? undefined,
  durationSecs: r.duration_secs,
  status: r.status,
  participants: r.participants ?? [],
  speakers: r.speakers ?? [],
  transcript: r.transcript ?? [],
  summary: r.summary ?? undefined,
  actionItems: r.action_items ?? [],
  notes: r.notes ?? undefined,
  notesEnhanced: r.notes_enhanced ?? undefined,
  teamspaceId: r.teamspace_id ?? undefined,
});

const taskRow = (t: Task, uid: string, ts: string) => ({
  id: t.id,
  user_id: uid,
  teamspace_id: ts,
  project_id: t.projectId ?? null,
  title: t.title,
  status: t.status,
  owner: t.owner ?? null,
  due: t.due ?? null,
  source_meeting_id: t.sourceMeetingId ?? null,
  source_action_item_id: t.sourceActionItemId ?? null,
  updated_at: now(),
});
const rowTask = (r: any): Task => ({
  id: r.id,
  projectId: r.project_id ?? null,
  title: r.title,
  status: r.status,
  owner: r.owner ?? undefined,
  due: r.due ?? undefined,
  sourceMeetingId: r.source_meeting_id ?? undefined,
  sourceActionItemId: r.source_action_item_id ?? undefined,
  teamspaceId: r.teamspace_id ?? undefined,
});

const usageRow = (u: UsageRecord, uid: string, ts: string) => ({
  id: u.id,
  user_id: uid,
  teamspace_id: ts,
  at: u.at,
  provider: u.provider,
  model: u.model,
  kind: u.kind,
  meeting_id: u.meetingId ?? null,
  audio_seconds: u.audioSeconds ?? null,
  input_tokens: u.inputTokens ?? null,
  output_tokens: u.outputTokens ?? null,
  cost_usd: u.costUsd,
  estimated: u.estimated ?? false,
});
const rowUsage = (r: any): UsageRecord => ({
  id: r.id,
  at: r.at,
  provider: r.provider,
  model: r.model,
  kind: r.kind,
  meetingId: r.meeting_id ?? undefined,
  audioSeconds: r.audio_seconds ?? undefined,
  inputTokens: r.input_tokens ?? undefined,
  outputTokens: r.output_tokens ?? undefined,
  costUsd: r.cost_usd,
  estimated: r.estimated,
});

function uid(): string | null {
  return useAuth.getState().user?.id ?? null;
}

function tsId(): string | null {
  return useTeamspace.getState().active()?.id ?? useTeamspace.getState().activeId;
}

export async function pushAll() {
  const id = uid();
  const ts = tsId();
  if (!cloudEnabled() || !id || !ts) return;
  const sb = supabase();
  const { meetings, projects, tasks } = useStore.getState();
  const records = useCost.getState().records;

  if (projects.length) await sb.from("projects").upsert(projects.map((p) => projectRow(p, id, ts)));
  if (meetings.length) await sb.from("meetings").upsert(meetings.map((m) => meetingRow(m, id, ts)));
  if (tasks.length) await sb.from("tasks").upsert(tasks.map((t) => taskRow(t, id, ts)));
  if (records.length) {
    const chunk = 100;
    for (let i = 0; i < records.length; i += chunk) {
      await sb
        .from("usage_records")
        .upsert(records.slice(i, i + chunk).map((r) => usageRow(r, id, ts)));
    }
  }
}

export async function pullAll() {
  const id = uid();
  const ts = tsId();
  if (!cloudEnabled() || !id || !ts) return;
  const sb = supabase();
  const [proj, meet, task, usage] = await Promise.all([
    sb.from("projects").select("*").eq("teamspace_id", ts),
    sb.from("meetings").select("*").eq("teamspace_id", ts).order("started_at", { ascending: false }),
    sb.from("tasks").select("*").eq("teamspace_id", ts),
    sb.from("usage_records").select("*").eq("teamspace_id", ts),
  ]);
  if (proj.data) useStore.setState({ projects: proj.data.map(rowProject) });
  if (meet.data) useStore.setState({ meetings: meet.data.map(rowMeeting) });
  if (task.data) useStore.setState({ tasks: task.data.map(rowTask) });
  if (usage.data) useCost.setState({ records: usage.data.map(rowUsage) });
  useStore.setState({ view: { kind: "all-meetings" } });
}

/** Clear local workspace data when switching teamspaces (before pull). */
export function clearWorkspace() {
  useStore.setState({
    meetings: [],
    projects: [],
    tasks: [],
    view: { kind: "all-meetings" },
    recording: { active: false, meetingId: null, startedAt: null, elapsedSecs: 0, systemActive: false },
  });
  useCost.setState({ records: [] });
}

let unsubs: (() => void)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function schedulePush() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    pushAll().catch((e) => console.error("[sync] push failed:", e));
  }, 1500);
}

export async function startSync() {
  stopSync();
  const id = uid();
  const ts = tsId();
  if (!cloudEnabled() || !id || !ts) return;
  const sb = supabase();

  const { data: cloudMeetings } = await sb
    .from("meetings")
    .select("id")
    .eq("teamspace_id", ts);
  const localMeetings = useStore.getState().meetings.length;
  if ((cloudMeetings?.length ?? 0) === 0 && localMeetings > 0) {
    await pushAll();
  } else {
    await pullAll();
  }

  unsubs.push(useStore.subscribe(() => schedulePush()));
  unsubs.push(useCost.subscribe(() => schedulePush()));
}

export function stopSync() {
  unsubs.forEach((u) => u());
  unsubs = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
