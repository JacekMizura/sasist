import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export type CommandDialogGroup<T extends string = string> = {
  title: string;
  id: T;
  items: { id: string; label: string; description?: string; keywords?: string }[];
};

type Props<T extends string = string> = {
  open: boolean;
  title: string;
  groups: CommandDialogGroup<T>[];
  onClose: () => void;
  onPick: (itemId: string) => void;
};

export function AutomationCommandDialog<T extends string = string>({
  open,
  title,
  groups,
  onClose,
  onPick,
}: Props<T>) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => {
          const blob = `${it.label} ${it.description ?? ""} ${it.keywords ?? ""} ${g.title}`.toLowerCase();
          return blob.includes(s);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/40 p-4 pt-[min(8vh,5rem)] backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[min(78vh,40rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/10"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj…"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">Brak wyników.</p>
          ) : (
            filtered.map((g) => (
              <div key={g.id} className="mb-3 last:mb-0">
                <p className="sticky top-0 z-[1] bg-white/95 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 backdrop-blur">
                  {g.title}
                </p>
                <div className="mt-1 space-y-0.5">
                  {g.items.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        onPick(it.id);
                        onClose();
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-xl border border-transparent px-3 py-2 text-left text-sm transition hover:border-slate-200 hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-900">{it.label}</span>
                      {it.description ? <span className="text-xs text-slate-500">{it.description}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
