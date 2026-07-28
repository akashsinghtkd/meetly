// Core domain model — mirrors the SQLite schema in PLAN.md §4.

export type MeetingStatus = "idle" | "recording" | "transcribing" | "processing" | "ready";

export interface Speaker {
  id: string;
  label: string; // "Speaker A", or channel "Me" / "Them"
  displayName: string;
  color: string;
}

export interface TranscriptSegment {
  id: string;
  speakerId: string;
  channel: "mic" | "system";
  tStart: number; // seconds
  tEnd: number;
  text: string;
}

export interface ActionItem {
  id: string;
  owner: string;
  task: string;
  due?: string;
  status: "open" | "done";
  sourceSegmentId?: string;
}

export interface Summary {
  executive: string;
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  nextAgenda: string[];
}

export type TaskStatus = "not_started" | "up_next" | "in_progress" | "done";

/** SaaS tenancy — billing + sharing boundary. */
export type TeamspaceRole = "owner" | "admin" | "member" | "viewer";

export interface Teamspace {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  createdBy: string;
  createdAt: string;
  /** Current user's role in this teamspace */
  role: TeamspaceRole;
}

export interface TeamspaceMember {
  id: string;
  teamspaceId: string;
  userId: string;
  email?: string;
  role: TeamspaceRole;
  status: "active" | "removed";
}

export interface TeamspaceInvite {
  id: string;
  teamspaceId: string;
  email: string;
  role: Exclude<TeamspaceRole, "owner">;
  token: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description?: string;
  createdAt?: string;
  teamspaceId?: string;
}

export interface Task {
  id: string;
  projectId: string | null; // null = general (no project)
  title: string;
  status: TaskStatus;
  owner?: string;
  due?: string;
  sourceMeetingId?: string;
  sourceActionItemId?: string;
  teamspaceId?: string;
}

export interface Meeting {
  id: string;
  title: string;
  emoji: string;
  project?: string; // legacy display label
  projectId?: string | null; // null / undefined = Inbox (unassigned)
  startedAt: string; // ISO
  endedAt?: string;
  durationSecs: number;
  status: MeetingStatus;
  participants: string[];
  micPath?: string;
  systemPath?: string;
  speakers: Speaker[];
  transcript: TranscriptSegment[];
  summary?: Summary;
  actionItems: ActionItem[];
  /** Your own notes, typed during/after the call (shown in ink). */
  notes?: string;
  /** AI-expanded version of your notes, grounded in the transcript (shown muted). */
  notesEnhanced?: string;
  error?: string;
  teamspaceId?: string;
}

export interface AudioDevice {
  name: string;
  is_default: boolean;
  likely_system_audio: boolean;
  is_loopback?: boolean;
}

export interface RecordingResult {
  duration_secs: number;
  mic_path: string | null;
  system_path: string | null;
}

export type View =
  | { kind: "all-meetings" }
  | { kind: "action-items" }
  | { kind: "tasks" }
  | { kind: "projects" }
  | { kind: "search" }
  | { kind: "settings" }
  | { kind: "team" }
  | { kind: "admin" }
  | { kind: "meeting"; id: string }
  | { kind: "project"; id: string; tab: "overview" | "meetings" | "tasks" };

export const TASK_COLUMNS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: "not_started", label: "Not started", dot: "#9b9a97" },
  { status: "up_next", label: "Up next", dot: "#d9730d" },
  { status: "in_progress", label: "In progress", dot: "#2383e2" },
  { status: "done", label: "Done", dot: "#0f9d58" },
];

export function canEditRole(role: TeamspaceRole | undefined): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function canAdminRole(role: TeamspaceRole | undefined): boolean {
  return role === "owner" || role === "admin";
}
