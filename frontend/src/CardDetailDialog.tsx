import { useEffect, useRef, useState } from "react";

const MAX_LENGTH = 1000;

interface CardDetailDialogProps {
  title: string;
  description: string;
  canEdit: boolean;
  onSave: (description: string) => Promise<boolean>;
  onClose: () => void;
}

function CardDetailDialog({
  title,
  description,
  canEdit,
  onSave,
  onClose,
}: CardDetailDialogProps) {
  const [text, setText] = useState(description);
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const ok = await onSave(text.trim());
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Card details"
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-800 wrap-break-words">
          {title}
        </h2>

        {canEdit ? (
          <>
            <label
              htmlFor="card-description"
              className="block text-sm text-slate-600 mt-4 mb-1"
            >
              Description
            </label>
            <textarea
              id="card-description"
              ref={areaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_LENGTH}
              rows={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1 text-right">
              {text.length} / {MAX_LENGTH}
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-700 whitespace-pre-wrap wrap-break-words">
            {description || "No description."}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm bg-slate-200 text-slate-700 hover:bg-slate-300"
          >
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CardDetailDialog;
