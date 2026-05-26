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

export type AutomationAnchorMenuGroup = {
  id: string;
  title: string;
  items: { id: string; label: string; description?: string; keywords?: string }[];
};

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  groups: AutomationAnchorMenuGroup[];
  onClose: () => void;
  onPick: (itemId: string) => void;
};

export function AutomationAnchorMenu({ open, anchorRef, title, groups, onClose, onPick }: Props) {
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
    <FloatingPortal id="floating-portal-automation-anchor-menu">
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="z-[130] flex w-[min(100vw-1rem,22rem)] max-w-[22rem] flex-col overflow-hidden rounded-xl bg-white py-1 shadow-2xl ring-1 ring-slate-900/[0.08]"
        role="dialog"
        aria-label={title}
        {...getFloatingProps()}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtruj…"
            className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Zamknij"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <p className="px-2.5 pb-1 pt-0.5 text-[11px] font-medium leading-tight text-slate-500">{title}</p>
        <div className="max-h-[min(20rem,45vh)] min-h-0 overflow-y-auto overscroll-y-contain px-1 pb-1.5 [scrollbar-width:thin]">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-slate-500">Brak wyników.</p>
          ) : (
            filtered.map((g) => (
              <div key={g.id} className="mb-1.5 last:mb-0">
                {g.title.trim() ? (
                  <p className="sticky top-0 z-[1] bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-400">{g.title}</p>
                ) : null}
                <div className={`space-y-px ${g.title.trim() ? "mt-0.5" : ""}`}>
                  {g.items.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        onPick(it.id);
                        onClose();
                      }}
                      className="flex w-full flex-col items-start gap-0 rounded-md px-2 py-1.5 text-left transition hover:bg-slate-100/90"
                    >
                      <span className="text-[13px] font-medium leading-tight text-slate-900">{it.label}</span>
                      {it.description ? (
                        <span className="text-[11px] leading-snug text-slate-500">{it.description}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
