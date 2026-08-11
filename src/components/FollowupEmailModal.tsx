import { useMemo, useState } from "react";
import { Copy, Mail, Send, X } from "lucide-react";
import { useStore } from "../store/store";
import { buildFollowupEmail, mailtoLink } from "../lib/followupEmail";
import { copyToClipboard } from "../lib/exportMeeting";
import { inTauri } from "../lib/tauri";
import type { Meeting } from "../lib/types";

/**
 * A ready-to-send follow-up email drafted from the meeting's AI notes. Meetly
 * never sends it — this hands the draft to the user's mail client or clipboard,
 * and the user reviews and sends.
 */
export function FollowupEmailModal({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const setNotice = useStore((s) => s.setNotice);
  const draft = useMemo(() => buildFollowupEmail(meeting), [meeting]);
  const [to, setTo] = useState(draft.to.join(", "));
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);

  const current = {
    to: to.split(",").map((s) => s.trim()).filter(Boolean),
    subject,
    body,
  };

  const copy = async () => {
    const ok = await copyToClipboard(`${subject}\n\n${body}`);
    setNotice(ok ? "Draft copied to clipboard" : "Couldn't access the clipboard");
  };

  const openInMail = async () => {
    const url = mailtoLink(current);
    try {
      if (inTauri()) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      } else {
        window.location.href = url;
      }
    } catch {
      const ok = await copyToClipboard(`${subject}\n\n${body}`);
      setNotice(ok ? "Couldn't open Mail — draft copied instead" : "Couldn't open Mail");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-line bg-surface shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Mail className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-ink">Follow-up email</h2>
          <span className="text-xs text-ink-faint">Drafted from your notes — you review &amp; send</span>
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-ink-faint hover:bg-surface-hover hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label="To">
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Add recipients (comma-separated)"
              className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
            />
          </Field>
          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
            />
          </Field>
          <Field label="Body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-sm leading-relaxed text-ink outline-none focus:border-accent"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink-light hover:bg-surface-hover"
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
          <button
            onClick={openInMail}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Send className="h-4 w-4" /> Open in Mail
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}
