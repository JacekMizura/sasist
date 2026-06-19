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
import { ArrowLeft, ChevronRight, X } from "lucide-react";

export type AutomationCategoryStep = {
  id: string;
  label: string;
  items: { id: string; label: string; description?: string }[];
};

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  categories: AutomationCategoryStep[];
  onClose: () => void;
  onPick: (itemId: string) => void;
};

export function AutomationCategoryStepMenu({ open, anchorRef, title, categories, onClose, onPick }: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);

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
    if (!open) setCategoryId(null);
  }, [open]);

  const activeCategory = useMemo(
    () => (categoryId ? categories.find((c) => c.id === categoryId) ?? null : null),
    [categories, categoryId],
  );

  if (!open) return null;

  return (
    <FloatingPortal id="floating-portal-automation-category-step-menu">
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="z-[130] flex w-[min(100vw-1rem,18rem)] max-w-[18rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        role="dialog"
        aria-label={title}
        {...getFloatingProps()}
      >
        <div className="flex items-center gap-1 border-b border-gray-200 px-2 py-2">
          {activeCategory ? (
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Wróć do kategorii"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : null}
          <p className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-slate-900">
            {activeCategory ? activeCategory.label : title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="max-h-[min(18rem,42vh)] overflow-y-auto overscroll-y-contain p-1 [scrollbar-width:thin]">
          {!activeCategory ? (
            categories.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-slate-500">Brak opcji.</p>
            ) : (
              categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                >
                  <span>{cat.label}</span>
                  <span className="flex items-center gap-1 text-xs font-normal text-slate-400">
                    {cat.items.length}
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                </button>
              ))
            )
          ) : (
            activeCategory.items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onPick(it.id);
                  onClose();
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-slate-900">{it.label}</span>
                {it.description ? <span className="text-xs text-slate-500">{it.description}</span> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
