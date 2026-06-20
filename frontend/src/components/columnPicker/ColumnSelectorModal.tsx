import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical, X } from "lucide-react";

import { filterToolbarBtnSecondary } from "../filters/filterUiTokens";

const PREFIX_S = "col-sel:";

const ADD_TO_VISIBLE_LABEL = "Dodaj do widocznych";
const REMOVE_FROM_VISIBLE_LABEL = "Usuń z widocznych";

const reorderBtnClass =
  "rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40";
const transferBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50";

export type ColumnCatalogItem = {
  id: string;
  label: string;
  /** `system` — pomijane w selektorze; zawsze renderowane przez tabelę. */
  type?: "system" | "user";
};

type ColumnSelectorModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  catalog: readonly ColumnCatalogItem[];
  selectedOrder: string[];
  /** Called on every change — persist here (e.g. localStorage). */
  onChange: (nextOrder: string[]) => void;
  selectedColumnLabel?: string;
  availableColumnLabel?: string;
};

function labelFor(catalog: readonly ColumnCatalogItem[], id: string): string {
  return catalog.find((c) => c.id === id)?.label ?? id;
}

function userCatalogOnly(catalog: readonly ColumnCatalogItem[]): ColumnCatalogItem[] {
  return catalog.filter((c) => c.type !== "system");
}

function SortableSelectedRow({
  colId,
  label,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  colId: string;
  label: string;
  index: number;
  total: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const sid = `${PREFIX_S}${colId}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sid });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-slate-200/80 bg-white px-2 py-1.5 text-[13px] text-slate-800 shadow-sm"
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Przeciągnij"
        aria-label="Przeciągnij"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <div className="flex shrink-0 gap-0.5">
        <button
          type="button"
          className={reorderBtnClass}
          disabled={index === 0}
          onClick={onMoveUp}
          aria-label="Wyżej"
          title="Wyżej"
        >
          ↑
        </button>
        <button
          type="button"
          className={reorderBtnClass}
          disabled={index === total - 1}
          onClick={onMoveDown}
          aria-label="Niżej"
          title="Niżej"
        >
          ↓
        </button>
        <button
          type="button"
          className={transferBtnClass}
          onClick={onRemove}
          aria-label={REMOVE_FROM_VISIBLE_LABEL}
          title={REMOVE_FROM_VISIBLE_LABEL}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

function AvailableRow({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-slate-200/80 bg-white px-2 py-1.5 text-[13px] text-slate-800 shadow-sm">
      <button
        type="button"
        className={transferBtnClass}
        onClick={onAdd}
        aria-label={ADD_TO_VISIBLE_LABEL}
        title={ADD_TO_VISIBLE_LABEL}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </li>
  );
}

function SelectedDropZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "dz-selected" });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] flex-1 rounded-md border border-dashed p-2 transition-colors ${
        isOver ? "border-sky-400 bg-sky-50/40" : "border-transparent"
      }`}
    >
      {children}
    </div>
  );
}

function AvailableDropZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "dz-available" });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] flex-1 rounded-md border border-dashed p-2 transition-colors ${
        isOver ? "border-amber-400 bg-amber-50/40" : "border-transparent"
      }`}
    >
      {children}
    </div>
  );
}

export function ColumnSelectorModal({
  open,
  onClose,
  title = "Wybór kolumn",
  catalog,
  selectedOrder,
  onChange,
  selectedColumnLabel = "Widoczne",
  availableColumnLabel = "Dostępne",
}: ColumnSelectorModalProps) {
  const selectableCatalog = useMemo(() => userCatalogOnly([...catalog]), [catalog]);
  const catalogIds = useMemo(() => selectableCatalog.map((c) => c.id), [selectableCatalog]);
  const [left, setLeft] = useState<string[]>(selectedOrder);

  useEffect(() => {
    if (open) {
      setLeft(selectedOrder);
    }
  }, [open, selectedOrder]);

  const right = useMemo(() => catalogIds.filter((id) => !left.includes(id)), [catalogIds, left]);

  const pushChange = useCallback(
    (next: string[]) => {
      setLeft(next);
      onChange(next);
    },
    [onChange],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const sortableIds = useMemo(() => left.map((id) => `${PREFIX_S}${id}`), [left]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const aid = String(active.id);
    const oid = String(over.id);

    if (!aid.startsWith(PREFIX_S)) return;

    const col = aid.slice(PREFIX_S.length);
    if (oid === "dz-available") {
      pushChange(left.filter((x) => x !== col));
      return;
    }
    if (oid.startsWith(PREFIX_S)) {
      const target = oid.slice(PREFIX_S.length);
      const oldIndex = left.indexOf(col);
      const newIndex = left.indexOf(target);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      pushChange(arrayMove(left, oldIndex, newIndex));
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[5000] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Zamknij" onClick={onClose} />
      <div className="relative flex max-h-[min(92vh,760px)] w-full min-w-0 flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
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
        <div className="border-b border-sky-100 bg-sky-50 px-4 py-2.5 text-[12px] leading-snug text-sky-950 sm:px-5">
          Lewa kolumna: widoczne kolumny (przeciągnij lub użyj ↑ ↓). ← dodaje z prawej, → usuwa do prawej. Ustawienia
          zapisują się automatycznie w tej przeglądarce.
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 sm:grid-cols-2 sm:p-5">
            <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="border-b border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {selectedColumnLabel} ({left.length})
              </div>
              <SelectedDropZone>
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-1">
                    {left.length === 0 ? (
                      <li className="px-2 py-8 text-center text-[13px] text-slate-500">Dodaj kolumny z prawej strony.</li>
                    ) : (
                      left.map((id, index) => (
                        <SortableSelectedRow
                          key={id}
                          colId={id}
                          label={labelFor(selectableCatalog, id)}
                          index={index}
                          total={left.length}
                          onRemove={() => pushChange(left.filter((x) => x !== id))}
                          onMoveUp={() => {
                            if (index <= 0) return;
                            const n = [...left];
                            [n[index - 1], n[index]] = [n[index], n[index - 1]];
                            pushChange(n);
                          }}
                          onMoveDown={() => {
                            if (index >= left.length - 1) return;
                            const n = [...left];
                            [n[index], n[index + 1]] = [n[index + 1], n[index]];
                            pushChange(n);
                          }}
                        />
                      ))
                    )}
                  </ul>
                </SortableContext>
              </SelectedDropZone>
            </div>
            <div className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="border-b border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {availableColumnLabel} ({right.length})
              </div>
              <AvailableDropZone>
                <ul className="space-y-1">
                  {right.length === 0 ? (
                    <li className="px-2 py-8 text-center text-[13px] text-slate-500">Wszystkie kolumny są już widoczne.</li>
                  ) : (
                    right.map((id) => (
                      <AvailableRow
                        key={id}
                        label={labelFor(selectableCatalog, id)}
                        onAdd={() => {
                          if (left.includes(id)) return;
                          pushChange([...left, id]);
                        }}
                      />
                    ))
                  )}
                </ul>
              </AvailableDropZone>
            </div>
          </div>
        </DndContext>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
          <button type="button" onClick={onClose} className={filterToolbarBtnSecondary}>
            Zamknij
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
