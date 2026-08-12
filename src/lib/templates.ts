// Meeting templates ("Recipes"): each defines the sections the AI fills in, so
// notes are structured for the kind of meeting it was. Universal outputs
// (executive summary, action items, urgency, speaker names) are added on top by
// the summarizer regardless of template.

export interface TemplateSection {
  heading: string;
  /** What belongs in this section — steers the model. */
  guidance: string;
}

export interface MeetingTemplate {
  id: string;
  label: string;
  emoji: string;
  blurb: string;
  sections: TemplateSection[];
}

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    id: "general",
    label: "General",
    emoji: "📝",
    blurb: "Balanced notes for any meeting.",
    sections: [
      { heading: "Decisions", guidance: "Concrete decisions that were made." },
      { heading: "Risks", guidance: "Risks or concerns raised." },
      { heading: "Open questions", guidance: "Questions left unresolved." },
      { heading: "Next steps", guidance: "Agreed next steps or agenda for next time." },
    ],
  },
  {
    id: "one-on-one",
    label: "1:1",
    emoji: "🤝",
    blurb: "Manager / report check-in.",
    sections: [
      { heading: "Highlights", guidance: "Key updates and wins since last time." },
      { heading: "Blockers", guidance: "What is slowing them down or where they need help." },
      { heading: "Feedback", guidance: "Feedback given or received, in either direction." },
      { heading: "Growth & goals", guidance: "Career, development, or goal-related discussion." },
    ],
  },
  {
    id: "sales",
    label: "Sales call",
    emoji: "💼",
    blurb: "Discovery / prospect call.",
    sections: [
      { heading: "Pain points", guidance: "Problems and needs the prospect described." },
      { heading: "Requirements", guidance: "What they need in a solution." },
      { heading: "Objections", guidance: "Concerns or objections raised." },
      { heading: "Budget & timeline", guidance: "Budget, authority, or timing signals." },
      { heading: "Next steps", guidance: "Follow-ups agreed to move the deal forward." },
    ],
  },
  {
    id: "standup",
    label: "Standup",
    emoji: "🏃",
    blurb: "Quick team sync.",
    sections: [
      { heading: "Done", guidance: "Completed since the last standup." },
      { heading: "In progress", guidance: "Currently being worked on." },
      { heading: "Blockers", guidance: "Anything blocking progress." },
    ],
  },
  {
    id: "interview",
    label: "Interview",
    emoji: "🎤",
    blurb: "Candidate interview.",
    sections: [
      { heading: "Strengths", guidance: "Where the candidate was strong." },
      { heading: "Concerns", guidance: "Gaps, red flags, or areas of doubt." },
      { heading: "Notable answers", guidance: "Memorable responses or examples." },
      { heading: "Recommendation", guidance: "Overall lean — advance, hold, or pass — and why." },
    ],
  },
  {
    id: "kickoff",
    label: "Project kickoff",
    emoji: "🚀",
    blurb: "New project kickoff.",
    sections: [
      { heading: "Goals", guidance: "What success looks like." },
      { heading: "Scope", guidance: "What is in and out of scope." },
      { heading: "Owners", guidance: "Who owns what." },
      { heading: "Timeline", guidance: "Key dates and milestones." },
      { heading: "Risks", guidance: "Risks and dependencies." },
    ],
  },
];

export const DEFAULT_TEMPLATE_ID = "general";

export function getTemplate(id?: string): MeetingTemplate {
  return MEETING_TEMPLATES.find((t) => t.id === id) ?? MEETING_TEMPLATES[0];
}
