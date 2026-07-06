import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

const storageKey = (id: number) => `dte-template-name-${id}`;

type Props = {
  templateId: number;
  serverName: string;
  onNameChange: (name: string) => void;
};

export function EditableTemplateName({ templateId, serverName, onNameChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(serverName);
  const [display, setDisplay] = useState(() => readStored(templateId, serverName));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const name = readStored(templateId, serverName);
    setDisplay(name);
    setDraft(name);
  }, [serverName, templateId]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function readStored(id: number, fallback: string) {
    try {
      return localStorage.getItem(storageKey(id)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function commit() {
    const next = draft.trim() || serverName;
    setDisplay(next);
    setDraft(next);
    onNameChange(next);
    try {
      localStorage.setItem(storageKey(templateId), next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("dte-template-name-changed", { detail: { id: templateId, name: next } }));
    setEditing(false);
  }

  function cancel() {
    setDraft(display);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="min-w-[12rem] max-w-full rounded border border-blue-300 bg-white px-2 py-0.5 text-lg font-semibold text-slate-900 outline-none ring-2 ring-blue-100"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
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
