import type { Meeting, Project, Task } from "./types";

export const PROJECT_COLORS = ["#2383e2", "#0f9d58", "#9333ea", "#d9730d", "#e2554e", "#0891b2"];

export const seedProjects: Project[] = [
  { id: "p-product", name: "Product", emoji: "🚀", color: PROJECT_COLORS[0] },
  { id: "p-engineering", name: "Engineering", emoji: "🛠️", color: PROJECT_COLORS[1] },
];

export const seedTasks: Task[] = [];

export const SPEAKER_COLORS = [
  "#2383e2",
  "#e2554e",
  "#0f9d58",
  "#9333ea",
  "#d97706",
  "#0891b2",
];

export const seedMeetings: Meeting[] = [
  {
    id: "m-launch-sync",
    title: "Q3 Launch Sync",
    emoji: "🚀",
    project: "Product",
    projectId: "p-product",
    startedAt: "2026-07-21T15:00:00.000Z",
    endedAt: "2026-07-21T15:32:00.000Z",
    durationSecs: 1920,
    status: "ready",
    participants: ["John", "Sarah", "Priya"],
    speakers: [
      { id: "s1", label: "Me", displayName: "John", color: SPEAKER_COLORS[0] },
      { id: "s2", label: "Them", displayName: "Sarah", color: SPEAKER_COLORS[1] },
      { id: "s3", label: "Them", displayName: "Priya", color: SPEAKER_COLORS[2] },
    ],
    transcript: [
      { id: "t1", speakerId: "s1", channel: "mic", tStart: 2, tEnd: 6, text: "Alright, let's lock the launch date. I'm pushing for next Friday." },
      { id: "t2", speakerId: "s2", channel: "system", tStart: 7, tEnd: 12, text: "We still need QA approval before we can commit to Friday." },
      { id: "t3", speakerId: "s3", channel: "system", tStart: 13, tEnd: 19, text: "The API work is the blocker. I can have it done by Wednesday if I drop the analytics task." },
      { id: "t4", speakerId: "s1", channel: "mic", tStart: 20, tEnd: 25, text: "Do it. Analytics can slip a week. Sarah, can QA turn it around Thursday?" },
      { id: "t5", speakerId: "s2", channel: "system", tStart: 26, tEnd: 30, text: "If the build is in by Wednesday night, yes." },
    ],
    summary: {
      executive:
        "The team agreed to target a Friday launch, contingent on QA approval. Priya will prioritize the API work (done Wednesday) and defer analytics by a week. QA will validate Thursday.",
      decisions: [
        "Launch on Friday, pending QA sign-off",
        "Defer the analytics task by one week to unblock the API",
      ],
      risks: [
        "Friday launch slips if the build misses Wednesday night",
        "Deferring analytics may delay the growth dashboard",
      ],
      openQuestions: ["Who owns the go/no-go call Thursday evening?"],
      nextAgenda: ["QA results review", "Go/no-go decision", "Rollback plan"],
    },
    actionItems: [
      { id: "a1", owner: "Priya", task: "Finish API work", due: "Wed", status: "open", sourceSegmentId: "t3" },
      { id: "a2", owner: "Sarah", task: "Run QA pass and approve build", due: "Thu", status: "open", sourceSegmentId: "t5" },
      { id: "a3", owner: "John", task: "Make the go/no-go call", due: "Thu PM", status: "open" },
    ],
  },
  {
    id: "m-eng-standup",
    title: "Engineering Standup",
    emoji: "🛠️",
    project: "Engineering",
    projectId: "p-engineering",
    startedAt: "2026-07-20T09:00:00.000Z",
    endedAt: "2026-07-20T09:14:00.000Z",
    durationSecs: 840,
    status: "ready",
    participants: ["John", "Marcus"],
    speakers: [
      { id: "s1", label: "Me", displayName: "John", color: SPEAKER_COLORS[0] },
      { id: "s2", label: "Them", displayName: "Marcus", color: SPEAKER_COLORS[3] },
    ],
    transcript: [
      { id: "t1", speakerId: "s2", channel: "system", tStart: 1, tEnd: 8, text: "The auth refactor is the same rate-limit issue we hit in the April 12 sync. Reusing that fix." },
      { id: "t2", speakerId: "s1", channel: "mic", tStart: 9, tEnd: 14, text: "Good catch. Link it in the PR so we have the history." },
    ],
    summary: {
      executive:
        "Marcus connected the current auth refactor to a rate-limit bug previously solved on April 12 and will reuse that fix. John asked to link the prior context in the PR.",
      decisions: ["Reuse the April 12 rate-limit fix for the auth refactor"],
      risks: [],
      openQuestions: [],
      nextAgenda: ["Auth refactor review"],
    },
    actionItems: [
      { id: "a1", owner: "Marcus", task: "Link April 12 context in the auth PR", status: "done", sourceSegmentId: "t2" },
    ],
  },
];
