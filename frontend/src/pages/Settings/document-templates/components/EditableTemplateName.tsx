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
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(storageKey(templateId)) ?? serverName;
    } catch {
      return serverName;
    }
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue((prev) => {
      try {
        return localStorage.getItem(storageKey(templateId)) ?? serverName;
      } catch {
        return serverName;
      }
    });
  }, [serverName, templateId]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const next = value.trim() || serverName;
    setValue(next);
    onNameChange(next);
    try {
      localStorage.setItem(storageKey(templateId), next);
    } catch {
      /* ignore */
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="min-w-[12rem] max-w-full rounded border border-blue-300 bg-white px-2 py-0.5 text-lg font-semibold text-slate-900 outline-none ring-2 ring-blue-100"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue(serverName);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="group inline-flex max-w-full items-center gap-1.5 text-left"
      onClick={() => setEditing(true)}
      title="Zmień nazwę"
    >
      <span className="truncate text-lg font-semibold text-slate-900">{value}</span>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}
