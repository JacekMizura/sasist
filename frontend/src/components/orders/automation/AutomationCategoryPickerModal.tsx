import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, X } from "lucide-react";

import type { AutomationCategoryStep } from "./AutomationCategoryStepMenu";
import { oaBtn } from "./orderAutomationUiTokens";

type Props = {
  open: boolean;
  title: string;
  categories: AutomationCategoryStep[];
  onClose: () => void;
  onPick: (itemId: string) => void;
};

export function AutomationCategoryPickerModal({ open, title, categories, onClose, onPick }: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setCategoryId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const activeCategory = useMemo(
    () => (categoryId ? categories.find((c) => c.id === categoryId) ?? null : null),
    [categories, categoryId],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 border-b border-gray-200 px-3 py-2.5">
          {activeCategory ? (
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="Wróć do kategorii"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            </button>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
            {activeCategory ? activeCategory.label : title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2 [scrollbar-width:thin]">
          {!activeCategory ? (
            categories.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">Brak opcji.</p>
            ) : (
              categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
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
                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-slate-900">{it.label}</span>
                {it.description ? <span className="text-xs text-slate-500">{it.description}</span> : null}
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-3 py-2.5">
          <button type="button" className={oaBtn} onClick={onClose}>
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}
