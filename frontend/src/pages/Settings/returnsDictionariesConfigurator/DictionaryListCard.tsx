import { useMemo } from "react";
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
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import type { ReturnCustomerReturnTypeDto, ReturnOrderSourceDto } from "../../../types/returnModuleConfig";
import { OrderSourceLogo } from "./OrderSourceLogo";
import type { DictionaryKind, DictionaryRow } from "./constants";

type Props = {
  title: string;
  description: string;
  addLabel: string;
  kind: DictionaryKind;
  rows: DictionaryRow[];
  busy?: boolean;
  onAdd: () => void;
  onEdit: (row: DictionaryRow) => void;
  onDelete: (row: DictionaryRow) => void;
  onToggleActive: (row: DictionaryRow, active: boolean) => void;
  onReorder: (rows: DictionaryRow[]) => void;
};

export function DictionaryListCard({
  title,
  description,
  addLabel,
  kind,
  rows,
  busy = false,
  onAdd,
  onEdit,
  onDelete,
  onToggleActive,
  onReorder,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const sorted = useMemo(() => [...rows].sort((a, b) => a.sort_order - b.sort_order), [rows]);
  const ids = useMemo(() => sorted.map((r) => `${kind}:${r.code}`), [sorted, kind]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(sorted, oldIndex, newIndex));
  };

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-45"
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {addLabel}
        </button>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-slate-100 p-2">
            {sorted.map((row) => (
              <SortableDictionaryRow
                key={`${kind}:${row.code}`}
                id={`${kind}:${row.code}`}
                kind={kind}
                row={row}
                busy={busy}
                onEdit={() => onEdit(row)}
                onDelete={() => onDelete(row)}
                onToggleActive={(active) => onToggleActive(row, active)}
              />
            ))}
            {sorted.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-slate-400">Brak pozycji — dodaj pierwszą.</li>
            ) : null}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function SortableDictionaryRow({
  id,
  kind,
  row,
  busy,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  id: string;
  kind: DictionaryKind;
  row: DictionaryRow;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50/80 sm:flex-nowrap"
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
        title="Przeciągnij aby zmienić kolejność"
        aria-label="Zmień kolejność"
        disabled={busy}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>

      {kind === "source" ? (
        <OrderSourceLogo code={row.code} label={row.label} />
      ) : null}

      <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">{row.label}</p>

      <label className="inline-flex shrink-0 items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={row.is_active}
          disabled={busy}
          onChange={(e) => onToggleActive(e.target.checked)}
        />
        Aktywny
      </label>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Edytuj
        </button>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-45"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Usuń
        </button>
      </div>
    </li>
  );
}
