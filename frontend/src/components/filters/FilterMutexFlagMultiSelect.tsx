import { Check, ChevronDown, Search } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { filterCheckboxClass, filterControlHeightClass, filterInputClass, filterToolbarBtnSecondary } from "./filterUiTokens";

export type FilterMutexFlagOption = {
  id: string;
  label: string;
  /** When this flag is turned on, these other ids are removed (mutual exclusion). */
  mutexWith?: string[];
};

type FilterMutexFlagMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  options: FilterMutexFlagOption[];
  /** Optional prefix on closed trigger; omit when an outer label is used. */
  menuTitle?: string;
  emptySummary?: string;
  searchPlaceholder?: string;
  maxListHeightClass?: string;
  className?: string;
  disabled?: boolean;
};

export function FilterMutexFlagMultiSelect({
  value,
  onChange,
  options,
  menuTitle,
  emptySummary = "Wszystkie",
  searchPlaceholder = "Szukaj…",
  maxListHeightClass = "max-h-56",
  className = "",
  disabled,
}: FilterMutexFlagMultiSelectProps) {
  const reactId = useId();
  const triggerId = `filter-flags-${reactId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const mutexMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const o of options) {
      m.set(o.id, new Set(o.mutexWith ?? []));
    }
    return m;
  }, [options]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, q]);

  const summary = useMemo(() => {
    if (value.length === 0) return emptySummary;
    if (value.length === 1) {
      const hit = options.find((o) => o.id === value[0]);
      return hit?.label ?? value[0];
    }
    return `Wybrano ${value.length}`;
  }, [emptySummary, options, value]);

  const toggle = useCallback(
    (id: string, checked: boolean) => {
      if (!checked) {
        onChange(value.filter((v) => v !== id));
        return;
      }
      const remove = mutexMap.get(id) ?? new Set();
      const base = value.filter((v) => v !== id && !remove.has(v));
      onChange([...base, id]);
    },
    [mutexMap, onChange, value],
  );

  const clear = useCallback(() => {
    onChange([]);
    setQ("");
  }, [onChange]);

  const triggerClass = `${filterControlHeightClass} flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200/90 bg-white px-2.5 text-left text-[13px] font-medium text-slate-900 shadow-none transition hover:border-slate-300 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-60`;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`.trim()}>
      <button
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-label={menuTitle ?? "Filtry dodatkowe"}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
      >
        <span className="min-w-0 flex-1 truncate">
          {menuTitle ? (
            <>
              <span className="text-slate-500">{menuTitle}: </span>
              {summary}
            </>
          ) : (
            summary
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-slate-200/90 bg-white py-1.5 shadow-md"
          role="listbox"
          aria-labelledby={triggerId}
        >
          {options.length > 8 ? (
            <div className="border-b border-slate-100 px-2 pb-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={`${filterInputClass} pr-8`}
                  aria-label={searchPlaceholder}
                />
              </div>
            </div>
          ) : null}
          <div className={`${maxListHeightClass} overflow-y-auto px-1.5 pt-0.5`}>
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-center text-[11px] text-slate-500">Brak wyników.</p>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.id);
                return (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] text-slate-800 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggle(o.id, e.target.checked)}
                      className={filterCheckboxClass}
                    />
                    <span className="min-w-0 flex-1 leading-tight">{o.label}</span>
                    {checked ? <Check className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden /> : null}
                  </label>
                );
              })
            )}
          </div>
          <div className="border-t border-slate-100 px-1.5 pt-1.5">
            <button type="button" onClick={clear} className={`${filterToolbarBtnSecondary} h-8 w-full justify-center text-[12px]`}>
              Wyczyść wybór
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
