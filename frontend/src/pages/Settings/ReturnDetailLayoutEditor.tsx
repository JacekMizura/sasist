import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { RETURN_DETAIL_SECTION_LABELS_PL } from "../../constants/returnModuleDetailSections";
import type { ReturnDetailLayoutDto, ReturnDetailSectionWidth } from "../../types/returnModuleConfig";
import { normalizeReturnDetailLayout } from "../../utils/returnDetailLayout";

const PL = "rmz-dtl-L:";
const PR = "rmz-dtl-R:";

const WIDTH_OPTIONS: { value: ReturnDetailSectionWidth; label: string }[] = [
  { value: "full", label: "Pełna szerokość kolumny" },
  { value: "sidebar", label: "Blok standardowy" },
  { value: "compact", label: "Kompaktowy" },
];

function labelFor(id: string): string {
  return RETURN_DETAIL_SECTION_LABELS_PL[id as keyof typeof RETURN_DETAIL_SECTION_LABELS_PL] ?? id;
}

function SortableRow({
  sid,
  label,
  width,
  onWidth,
}: {
  sid: string;
  label: string;
  width: ReturnDetailSectionWidth;
  onWidth: (w: ReturnDetailSectionWidth) => void;
}) {
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
      className="rounded-lg border border-slate-200/90 bg-white shadow-sm"
    >
      <div className="flex items-start gap-2 px-2 py-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Przeciągnij"
          aria-label="Przeciągnij"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 shrink-0" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium leading-snug text-slate-900">{label}</span>
          <label className="mt-1.5 block text-[10px] font-medium uppercase text-slate-400">Szerokość bloku</label>
          <select
            value={width}
            onChange={(e) => onWidth(e.target.value as ReturnDetailSectionWidth)}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800"
          >
            {WIDTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </li>
  );
}

function DropPane({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-slate-200/80 bg-white p-3 shadow-sm">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[180px] flex-1 rounded-md border border-dashed p-2 transition-colors ${
          isOver ? "border-blue-400 bg-blue-50/40" : "border-slate-200 bg-slate-50/50"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

type Props = {
  layout: ReturnDetailLayoutDto;
  onChange: (next: ReturnDetailLayoutDto) => void;
};

export function ReturnDetailLayoutEditor({ layout, onChange }: Props) {
  const norm0 = useMemo(() => normalizeReturnDetailLayout(layout), [layout]);
  const [left, setLeft] = useState<string[]>(norm0.left);
  const [right, setRight] = useState<string[]>(norm0.right);
  const [sectionWidths, setSectionWidths] = useState<Partial<Record<string, ReturnDetailSectionWidth>>>(
    () => ({ ...norm0.sectionWidths }),
  );
  const sectionWidthsRef = useRef(sectionWidths);
  const leftRef = useRef(left);
  const rightRef = useRef(right);
  useEffect(() => {
    sectionWidthsRef.current = sectionWidths;
  }, [sectionWidths]);
  useEffect(() => {
    leftRef.current = left;
    rightRef.current = right;
  }, [left, right]);

  useEffect(() => {
    const n = normalizeReturnDetailLayout(layout);
    setLeft(n.left);
    setRight(n.right);
    const sw = { ...n.sectionWidths };
    setSectionWidths(sw);
    sectionWidthsRef.current = sw;
  }, [layout]);

  const emit = useCallback(
    (l: string[], r: string[]) => {
      setLeft(l);
      setRight(r);
      onChange({ left_column: l, right_column: r, section_widths: { ...sectionWidthsRef.current } });
    },
    [onChange],
  );

  const setWidth = useCallback(
    (sectionId: string, w: ReturnDetailSectionWidth) => {
      setSectionWidths((prev) => {
        const next = { ...prev, [sectionId]: w };
        sectionWidthsRef.current = next;
        onChange({
          left_column: leftRef.current,
          right_column: rightRef.current,
          section_widths: next,
        });
        return next;
      });
    },
    [onChange],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const idsL = useMemo(() => left.map((id) => `${PL}${id}`), [left]);
  const idsR = useMemo(() => right.map((id) => `${PR}${id}`), [right]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const aid = String(active.id);
    const oid = String(over.id);

    const strip = (p: string, raw: string) => (raw.startsWith(p) ? raw.slice(p.length) : null);

    const moveBetween = (col: string, fromLeft: boolean, insertBefore?: string | null) => {
      let l = [...left];
      let r = [...right];
      if (fromLeft) {
        l = l.filter((x) => x !== col);
        if (!r.includes(col)) {
          if (insertBefore && r.includes(insertBefore)) {
            const ix = r.indexOf(insertBefore);
            r = [...r.slice(0, ix), col, ...r.slice(ix)];
          } else r = [...r, col];
        }
      } else {
        r = r.filter((x) => x !== col);
        if (!l.includes(col)) {
          if (insertBefore && l.includes(insertBefore)) {
            const ix = l.indexOf(insertBefore);
            l = [...l.slice(0, ix), col, ...l.slice(ix)];
          } else l = [...l, col];
        }
      }
      emit(l, r);
    };

    const reorder = (side: "L" | "R", col: string, target: string) => {
      const arr = side === "L" ? [...left] : [...right];
      const oldIndex = arr.indexOf(col);
      const newIndex = arr.indexOf(target);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      const next = arrayMove(arr, oldIndex, newIndex);
      if (side === "L") emit(next, right);
      else emit(left, next);
    };

    if (aid.startsWith(PL)) {
      const col = strip(PL, aid);
      if (!col) return;
      if (oid === "dz-right") {
        moveBetween(col, true, null);
        return;
      }
      if (oid.startsWith(PR)) {
        const target = strip(PR, oid);
        if (target) moveBetween(col, true, target);
        return;
      }
      if (oid.startsWith(PL)) {
        const target = strip(PL, oid);
        if (target) reorder("L", col, target);
      }
      return;
    }

    if (aid.startsWith(PR)) {
      const col = strip(PR, aid);
      if (!col) return;
      if (oid === "dz-left") {
        moveBetween(col, false, null);
        return;
      }
      if (oid.startsWith(PL)) {
        const target = strip(PL, oid);
        if (target) moveBetween(col, false, target);
        return;
      }
      if (oid.startsWith(PR)) {
        const target = strip(PR, oid);
        if (target) reorder("R", col, target);
      }
    }
  };

  const widthFor = (id: string): ReturnDetailSectionWidth => sectionWidths[id] ?? "sidebar";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-100/90 to-white p-4 shadow-inner">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Podgląd układu</p>
            <p className="mt-0.5 max-w-xl text-sm text-slate-700">
              Tak wygląda podział na dwie kolumny na stronie szczegółów zwrotu — przeciągaj bloki jak w edytorze szablonu.
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 shadow-sm">
            RMZ · szczegóły
          </div>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 lg:grid-cols-2">
            <DropPane
              id="dz-left"
              title="Lewa kolumna"
              hint="Najczęściej produkty, terminal WMS, zdjęcia, dziennik."
            >
              <SortableContext items={idsL} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {left.length === 0 ? (
                    <li className="py-8 text-center text-xs text-slate-500">Przeciągnij sekcje z prawej lub dodaj z konfiguracji domyślnej.</li>
                  ) : (
                    left.map((id) => (
                      <SortableRow
                        key={id}
                        sid={`${PL}${id}`}
                        label={labelFor(id)}
                        width={widthFor(id)}
                        onWidth={(w) => setWidth(id, w)}
                      />
                    ))
                  )}
                </ul>
              </SortableContext>
            </DropPane>
            <DropPane id="dz-right" title="Prawa kolumna" hint="Status, podsumowanie, dokumenty, notatki…">
              <SortableContext items={idsR} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {right.length === 0 ? (
                    <li className="py-8 text-center text-xs text-slate-500">Pusta — przeciągnij tu bloki z lewej.</li>
                  ) : (
                    right.map((id) => (
                      <SortableRow
                        key={id}
                        sid={`${PR}${id}`}
                        label={labelFor(id)}
                        width={widthFor(id)}
                        onWidth={(w) => setWidth(id, w)}
                      />
                    ))
                  )}
                </ul>
              </SortableContext>
            </DropPane>
          </div>
        </DndContext>
      </div>
    </div>
  );
}
