-- Two-tone notepad: your own notes (ink) + an AI-expanded version (muted).
-- Stored on the meeting row so they sync like everything else.

alter table public.meetings
  add column if not exists notes text,
  add column if not exists notes_enhanced text;
