import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

type Props = {
  templateId: number;
  serverName: string;
  onNameSave: (name: string) => Promise<void>;
};

export function EditableTemplateName({ templateId, serverName, onNameSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(serverName);
  const [display, setDisplay] = useState(serverName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplay(serverName);
    setDraft(serverName);
  }, [serverName, templateId]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    const next = draft.trim() || serverName;
    if (next === display) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onNameSave(next);
      setDisplay(next);
      setDraft(next);
      setEditing(false);
    } catch {
      setDraft(display);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(display);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        disabled={saving}
        className="min-w-[12rem] max-w-full rounded border border-blue-300 bg-white px-2 py-0.5 text-lg font-semibold text-slate-900 outline-none ring-2 ring-blue-100 disabled:opacity-60"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={() => void commit()}
      />
    );
  }

  return (
    <span className="group inline-flex max-w-full items-center gap-1.5">
      <button
        type="button"
        className="truncate text-left text-lg font-semibold text-slate-900 hover:text-slate-700"
        onClick={() => {
          setDraft(display);
          setEditing(true);
        }}
      >
        {display}
      </button>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
        title="Zmień nazwę"
        onClick={() => {
          setDraft(display);
          setEditing(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
