import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { Search, X } from "lucide-react";

import { MANUAL_ACTION_ICON_CATALOG, type ManualIconEntry } from "@/modules/orders/automation/utils/orderAutomationManualIcons";

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  selectedKey: string;
  onClose: () => void;
  onPick: (iconKey: string) => void;
};

export function AutomationIconGridPicker({ open, anchorRef, selectedKey, onClose, onPick }: Props) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (v) => {
      if (!v) onClose();
    },
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    refs.setReference(anchorRef.current);
  }, [anchorRef, refs, open]);

  const dismiss = useDismiss(context, { ancestorScroll: true, outsidePress: true, escapeKey: true });
  const { getFloatingProps } = useInteractions([dismiss]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return MANUAL_ACTION_ICON_CATALOG;
    return MANUAL_ACTION_ICON_CATALOG.filter(
      (e) =>
        e.key.toLowerCase().includes(s) ||
        e.label.toLowerCase().includes(s) ||
        e.category.toLowerCase().includes(s),
    );
  }, [q]);

  const byCategory = useMemo(() => {
    const m = new Map<string, ManualIconEntry[]>();
    for (const e of filtered) {
      if (!m.has(e.category)) m.set(e.category, []);
      m.get(e.category)!.push(e);
    }
    return [...m.entries()];
  }, [filtered]);

  if (!open) return null;

  return (
    <FloatingPortal id="floating-portal-automation-icon-grid">
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="z-[135] flex w-[min(100vw-1rem,22rem)] max-w-[22rem] flex-col overflow-hidden rounded-xl bg-white py-1 shadow-2xl ring-1 ring-slate-900/[0.08]"
        role="dialog"
        aria-label="Wybór ikony"
        {...getFloatingProps()}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj ikony…"
            className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
            aria-label="Zamknij"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <div className="max-h-[min(16rem,38vh)] min-h-0 overflow-y-auto overscroll-y-contain px-2 pb-2 [scrollbar-width:thin]">
          {byCategory.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">Brak wyników.</p>
          ) : (
            byCategory.map(([cat, items]) => (
              <div key={cat} className="mb-2 last:mb-0">
                <p className="sticky top-0 z-[1] bg-white/95 py-1 text-[11px] font-medium text-slate-400">{cat}</p>
                <div className="grid grid-cols-4 gap-1">
                  {items.map((e) => {
                    const Icon = e.Icon;
                    const active = e.key === selectedKey;
                    return (
                      <button
                        key={e.key}
                        type="button"
                        title={e.label}
                        onClick={() => {
                          onPick(e.key);
                          onClose();
                        }}
                        className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition ${
                          active ? "bg-slate-900 text-white ring-1 ring-slate-900" : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        <span className="max-w-full truncate">{e.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
