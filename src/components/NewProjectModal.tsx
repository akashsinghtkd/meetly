import { useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store/store";
import { PROJECT_COLORS } from "../lib/seed";

const EMOJI_CHOICES = ["📁", "🚀", "🛠️", "📊", "🎯", "💡", "🧩", "📦", "🌐", "🔬", "✏️", "🏁", "🎨", "📣", "🧪", "⚙️"];

export function NewProjectModal() {
  const open = useStore((s) => s.newProjectOpen);
  const setOpen = useStore((s) => s.setNewProjectOpen);
  const addProject = useStore((s) => s.addProject);
  const openProject = useStore((s) => s.openProject);

  const [emoji, setEmoji] = useState("📁");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  // Reset fields each time the modal opens.
  useEffect(() => {
    if (open) {
      setEmoji("📁");
      setName("");
      setDescription("");
      setColor(PROJECT_COLORS[0]);
    }
  }, [open]);

  if (!open) return null;

  const create = () => {
    if (!name.trim()) return;
    const id = addProject({ name, emoji, description, color });
    setOpen(false);
    openProject(id);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
      <div
        className="w-[440px] max-w-[92vw] rounded-xl bg-surface shadow-panel overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-line">
          <h2 className="font-semibold text-ink">New project</h2>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-surface-hover text-ink-faint">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* icon + name */}
          <div className="flex items-start gap-3">
            <div className="text-4xl leading-none w-12 h-12 grid place-items-center rounded-lg" style={{ background: `${color}18` }}>
              {emoji}
            </div>
            <div className="flex-1">
              <label className="block text-[13px] font-medium text-ink-light mb-1">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="e.g. Togoparts"
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* icon picker */}
          <div>
            <label className="block text-[13px] font-medium text-ink-light mb-1.5">Icon</label>
            <div className="flex flex-wrap gap-1">
              {EMOJI_CHOICES.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={clsx(
                    "text-xl rounded-md p-1.5 hover:bg-surface-hover",
                    emoji === e && "bg-surface-active ring-1 ring-accent",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* color */}
          <div>
            <label className="block text-[13px] font-medium text-ink-light mb-1.5">Color</label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={clsx("h-6 w-6 rounded-full", color === c && "ring-2 ring-offset-2 ring-ink/30")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {/* description */}
          <div>
            <label className="block text-[13px] font-medium text-ink-light mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about? (optional)"
              rows={2}
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line bg-surface-sidebar">
          <button onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-sm text-ink-light hover:bg-surface-hover">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!name.trim()}
            className="rounded-md bg-accent text-white px-4 py-1.5 text-sm font-medium hover:brightness-105 disabled:opacity-50"
          >
            Create project
          </button>
        </div>
      </div>
    </div>
  );
}
