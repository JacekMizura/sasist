import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { ChevronRight, GripVertical, X } from "lucide-react";

import { filterToolbarBtnPrimary, filterToolbarBtnSecondary } from "./filterUiTokens";

export type FilterFieldCatalogItem = { id: string; label: string };

type FilterVisibilityModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Current ordered visible ids (left column). */
  selectedOrder: string[];
  onSave: (nextOrder: string[]) => void;
  catalog: readonly FilterFieldCatalogItem[];
};

function labelFor(catalog: readonly FilterFieldCatalogItem[], id: string): string {
  return catalog.find((c) => c.id === id)?.label ?? id;
}

export function FilterVisibilityModal({
  open,
  onClose,
  title = "Widoczne pola filtrów",
  selectedOrder,
  onSave,
  catalog,
}: FilterVisibilityModalProps) {
  console.log("[CMP] VisibleFiltersSelector", { open, catalogLen: catalog.length });
  const catalogIds = useMemo(() => catalog.map((c) => c.id), [catalog]);
  const [left, setLeft] = useState<string[]>(selectedOrder);

  useEffect(() => {
    if (open) setLeft(selectedOrder);
  }, [open, selectedOrder]);

  const right = useMemo(() => catalogIds.filter((id) => !left.includes(id)), [catalogIds, left]);

  const moveToSelected = useCallback((id: string) => {
    setLeft((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const moveToAvailable = useCallback((id: string) => {
    setLeft((prev) => prev.filter((x) => x !== id));
  }, []);

  const moveLeft = useCallback((index: number) => {
    if (index <= 0) return;
    setLeft((prev) => {
      const n = [...prev];
      [n[index - 1], n[index]] = [n[index], n[index - 1]];
      return n;
    });
  }, []);

  const moveRight = useCallback((index: number) => {
    if (index >= left.length - 1) return;
    setLeft((prev) => {
      const n = [...prev];
      [n[index], n[index + 1]] = [n[index + 1], n[index]];
      return n;
    });
  }, [left.length]);

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const onDragStart = (index: number) => setDragIndex(index);
  const onDragEnd = () => setDragIndex(null);
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
  };
  const onDrop = (targetIndex: number) => {
    if (dragIndex == null || dragIndex === targetIndex) return;
    setLeft((prev) => {
      const n = [...prev];
      const [removed] = n.splice(dragIndex, 1);
      n.splice(targetIndex, 0, removed);
      return n;
    });
    setDragIndex(null);
  };

  const handleSave = () => {
    onSave(left);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Zamknij"
        onClick={onClose}
      />
      <div className="relative flex max-h-[min(90vh,720px)] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="border-b border-slate-50 px-5 py-2 text-xs text-slate-500">
          Lewa kolumna: pola widoczne na liście (przeciągnij aby zmienić kolejność). Prawa: dostępne do dodania.
        </p>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-5 md:grid-cols-2">
          <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Wybrane ({left.length})
            </div>
            <ul className="min-h-[200px] flex-1 space-y-1 overflow-y-auto p-2">
              {left.length === 0 ? (
                <li className="px-2 py-6 text-center text-sm text-slate-500">Brak — dodaj z prawej strony.</li>
              ) : (
                left.map((id, index) => (
                  <li
                    key={id}
                    draggable
                    onDragStart={() => onDragStart(index)}
                    onDragEnd={onDragEnd}
                    onDragOver={onDragOver}
                    onDrop={() => onDrop(index)}
                    className="flex items-center gap-2 rounded-md border border-slate-200/80 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm"
                  >
                    <span className="cursor-grab text-slate-400" title="Przeciągnij">
                      <GripVertical className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{labelFor(catalog, id)}</span>
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        disabled={index === 0}
                        onClick={() => moveLeft(index)}
                        aria-label="Wyżej"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        disabled={index === left.length - 1}
                        onClick={() => moveRight(index)}
                        aria-label="Niżej"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-rose-700 hover:bg-rose-50"
                        onClick={() => moveToAvailable(id)}
                        aria-label="Usuń z widocznych"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dostępne ({right.length})
            </div>
            <ul className="min-h-[200px] flex-1 space-y-1 overflow-y-auto p-2">
              {right.length === 0 ? (
                <li className="px-2 py-6 text-center text-sm text-slate-500">Wszystkie pola są już wybrane.</li>
              ) : (
                right.map((id) => (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                  >
                    <span className="min-w-0 truncate">{labelFor(catalog, id)}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
                      onClick={() => moveToSelected(id)}
                      aria-label={`Dodaj ${labelFor(catalog, id)}`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className={filterToolbarBtnSecondary}>
            Anuluj
          </button>
          <button type="button" onClick={handleSave} className={filterToolbarBtnPrimary}>
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}
