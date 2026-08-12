// Progressive speaker naming *during* a recording.
//
// Mid-call the transcript only distinguishes "me" (mic) from "them" (system) —
// distinct remote people are separated later by diarization. So live naming
// targets the remote party: for a 1:1 we usually already know them from the
// calendar invite (handled at recording start); otherwise we watch for a
// self-introduction and relabel "Them" → their name. It only ever touches a
// single still-generic remote speaker, so it can't mislabel a group call — those
// are named accurately after the call by the summary pass.

import { useStore } from "../store/store";

const GENERIC = /^(me|them|speaker \d+|speaker [a-z])$/i;

// Capitalized words that can follow "I'm / this is …" but aren't names. The
// capture already requires a Capitalized token (a proper-noun signal that
// transcribers like Deepgram preserve for names but not mid-sentence common
// words), so this only needs to catch the capitalized stragglers.
const NON_NAME = new Set(
  ("here there sorry going good great okay fine sure done ready glad happy afraid the not just about back now today " +
    "monday tuesday wednesday thursday friday saturday sunday " +
    "january february march april may june july august september october november december")
    .split(" "),
);

/** A remote speaker's name from a self-introduction, or null. */
function detectSelfIntro(text: string): string | null {
  const patterns = [
    /\b[Mm]y name is\s+([A-Z][a-z]{1,19})/,
    /\b[Tt]his is\s+([A-Z][a-z]{1,19})/,
    /\bI['’]?m\s+([A-Z][a-z]{1,19})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && !NON_NAME.has(m[1].toLowerCase())) return m[1];
  }
  return null;
}

let timer: ReturnType<typeof setInterval> | null = null;

function tick(meetingId: string) {
  const store = useStore.getState();
  const m = store.meetings.find((x) => x.id === meetingId);
  if (!m || m.status !== "recording") return;

  // A group call (calendar shows >1 invitee) can't be named live — one "Them"
  // stands for several people. Leave it for post-call diarization.
  if ((m.attendees ?? []).length > 1) return;

  // Only act when there's exactly one still-generic remote speaker.
  const remote = m.speakers.filter((s) => s.id !== "me" && GENERIC.test(s.displayName));
  if (remote.length !== 1) return;

  const recent = m.transcript
    .filter((s) => s.channel === "system")
    .slice(-14)
    .map((s) => s.text)
    .join(" ");
  const name = detectSelfIntro(recent);
  if (name && name.toLowerCase() !== "me") {
    store.renameSpeaker(meetingId, remote[0].id, name);
  }
}

export function startLiveNaming(meetingId: string) {
  stopLiveNaming();
  timer = setInterval(() => tick(meetingId), 8000);
}

export function stopLiveNaming() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
