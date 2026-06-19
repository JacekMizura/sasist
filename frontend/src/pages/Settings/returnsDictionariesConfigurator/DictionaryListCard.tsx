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

import { FlatPageSection } from "../../../components/layout/FlatPageSection";
import type { ReturnCustomerReturnTypeDto, ReturnOrderSourceDto } from "../../../types/returnModuleConfig";
import { OrderSourceLogo } from "./OrderSourceLogo";
import type { DictionaryKind, DictionaryRow } from "./constants";

type Props = {
  title: string;
  description?: string;
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
    <FlatPageSection
      title={title}
      description={description}
      action={
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-45"
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {addLabel}
        </button>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-gray-200">
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
              <li className="py-8 text-center text-sm text-slate-400">Brak pozycji — dodaj pierwszą.</li>
            ) : null}
          </ul>
        </SortableContext>
      </DndContext>
    </FlatPageSection>
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
      className="flex flex-wrap items-center gap-3 py-3 hover:bg-slate-50/60 sm:flex-nowrap"
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
        <OrderSourceLogo label={row.label} logoUrl={"logo_url" in row ? row.logo_url : null} />
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
        Aktywne
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
