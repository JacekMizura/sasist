import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Pencil, Trash2 } from "lucide-react";

import type { OrderCustomFieldDto } from "../../../api/orderCustomFieldsApi";
import { FieldIcon } from "./FieldIcon";
import {
  orderCustomFieldKindLabel,
  orderCustomFieldTypeLabel,
  type OrderCustomFieldAdminRow,
} from "../../../utils/orderCustomFieldListPresentation";
import {
  ocfListActionsCellClass,
  ocfListActionsColWidth,
  ocfListActionsInnerClass,
  ocfListIconCellClass,
  ocfListIconColWidth,
  ocfListIconInnerClass,
  ocfListRowActionBtn,
  ocfListRowActionBtnDanger,
  ocfListRowClass,
  ocfListRowInnerClass,
  ocfListTableClass,
  ocfListTdClass,
  ocfListThClass,
  ocfListThSortClass,
} from "./orderCustomFieldsListTokens";

type SortableRowProps = {
  adminRow: OrderCustomFieldAdminRow;
  selected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onDelete: (row: OrderCustomFieldDto) => void;
  reorderEnabled: boolean;
  reorderBusy: boolean;
  zebraIndex: number;
};

function SortableFieldRow({
  adminRow,
  selected,
  onSelect,
  onDelete,
  reorderEnabled,
  reorderBusy,
  zebraIndex,
}: SortableRowProps) {
  const navigate = useNavigate();
  const row = adminRow.field;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !reorderEnabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`${ocfListRowClass} ${selected ? "bg-sky-50/40 hover:bg-sky-50/50" : ""}`}
      data-zebra={zebraIndex % 2 === 0 ? "even" : "odd"}
    >
      <td className={`${ocfListTdClass} w-10`}>
        <div className={ocfListRowInnerClass}>
          {reorderEnabled ? (
            <button
              type="button"
              className="inline-flex h-9 w-9 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
              title="Przeciągnij, aby zmienić kolejność"
              aria-label={`Zmień kolejność: ${row.name}`}
              disabled={reorderBusy}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : (
            <span className="inline-block h-9 w-9" aria-hidden />
          )}
        </div>
      </td>
      <td className={`${ocfListTdClass} w-10 text-center`}>
        <div className={ocfListRowInnerClass}>
          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
              checked={selected}
              onChange={(e) => onSelect(row.id, e.target.checked)}
              aria-label={`Zaznacz ${row.name}`}
            />
          </label>
        </div>
      </td>
      <td className={`${ocfListTdClass} font-mono text-sm font-semibold tabular-nums text-slate-600`} style={{ width: 72 }}>
        <div className={ocfListRowInnerClass}>{row.id}</div>
      </td>
      <td className={ocfListTdClass} style={{ width: "22%" }}>
        <div className={ocfListRowInnerClass}>
          <button
            type="button"
            className="block max-w-full truncate text-left text-base font-bold text-slate-900 hover:underline"
            title={row.name}
            onClick={() => navigate(`/orders/custom-fields/${row.id}/edit`)}
          >
            {row.name}
          </button>
        </div>
      </td>
      <td className={`${ocfListTdClass} hidden text-slate-700 md:table-cell`} style={{ width: "14%" }}>
        <div className={ocfListRowInnerClass}>{orderCustomFieldTypeLabel(row.type)}</div>
      </td>
      <td className={`${ocfListTdClass} hidden text-slate-600 lg:table-cell`} style={{ width: "16%" }}>
        <div className={ocfListRowInnerClass}>
          {orderCustomFieldKindLabel(row.type, row.settings_json as Record<string, unknown> | null | undefined)}
        </div>
      </td>
      <td className={`${ocfListIconCellClass} hidden sm:table-cell`} style={{ width: ocfListIconColWidth }}>
        <div className={ocfListIconInnerClass}>
          <FieldIcon field={row} />
        </div>
      </td>
      <td className={ocfListActionsCellClass} style={{ width: ocfListActionsColWidth }}>
        <div className={ocfListActionsInnerClass}>
          <Link
            to={`/orders/custom-fields/${row.id}/edit`}
            className={ocfListRowActionBtn}
            title="Edytuj"
            aria-label="Edytuj"
          >
            <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />
          </Link>
          <button
            type="button"
            className={ocfListRowActionBtnDanger}
            title="Usuń"
            aria-label="Usuń"
            disabled={reorderBusy}
            onClick={() => onDelete(row)}
          >
            <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function MobileFieldCard({
  adminRow,
  selected,
  onSelect,
  onDelete,
  reorderBusy,
}: Omit<SortableRowProps, "reorderEnabled" | "zebraIndex">) {
  const navigate = useNavigate();
  const row = adminRow.field;
  const settings = (row.settings_json ?? {}) as Record<string, unknown>;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <label className="mt-1 inline-flex shrink-0 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            checked={selected}
            onChange={(e) => onSelect(row.id, e.target.checked)}
            aria-label={`Zaznacz ${row.name}`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="text-left text-base font-bold text-slate-900 hover:underline"
              onClick={() => navigate(`/orders/custom-fields/${row.id}/edit`)}
            >
              {row.name}
            </button>
            <FieldIcon field={row} />
          </div>
          <p className="mt-1 font-mono text-xs tabular-nums text-slate-500">ID {row.id}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Typ</dt>
              <dd className="text-slate-700">{orderCustomFieldTypeLabel(row.type)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rodzaj</dt>
              <dd className="text-slate-600">{orderCustomFieldKindLabel(row.type, settings)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-row items-center justify-end gap-2">
            <Link
              to={`/orders/custom-fields/${row.id}/edit`}
              className={ocfListRowActionBtn}
              title="Edytuj"
              aria-label="Edytuj"
            >
              <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />
            </Link>
            <button
              type="button"
              className={ocfListRowActionBtnDanger}
              title="Usuń"
              aria-label="Usuń"
              disabled={reorderBusy}
              onClick={() => onDelete(row)}
            >
              <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export type OrderCustomFieldsTableProps = {
  rows: OrderCustomFieldAdminRow[];
  selectedIds: Set<number>;
  idSort: "asc" | "desc";
  onIdSortChange: (dir: "asc" | "desc") => void;
  onSelect: (id: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onDelete: (row: OrderCustomFieldDto) => void;
  reorderEnabled: boolean;
  reorderBusy: boolean;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
};

export function OrderCustomFieldsTable({
  rows,
  selectedIds,
  idSort,
  onIdSortChange,
  onSelect,
  onSelectAll,
  onDelete,
  reorderEnabled,
  reorderBusy,
  allVisibleSelected,
  someVisibleSelected,
}: OrderCustomFieldsTableProps) {
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => (idSort === "asc" ? a.field.id - b.field.id : b.field.id - a.field.id));
    return copy;
  }, [rows, idSort]);

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className={ocfListTableClass}>
          <colgroup>
            <col className="w-10" />
            <col className="w-10" />
            <col style={{ width: 72 }} />
            <col style={{ width: "22%" }} />
            <col className="hidden md:table-column" style={{ width: "14%" }} />
            <col className="hidden lg:table-column" style={{ width: "16%" }} />
            <col className="hidden sm:table-column" style={{ width: ocfListIconColWidth }} />
            <col style={{ width: ocfListActionsColWidth }} />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-white">
              <th className={ocfListThClass} aria-label="Kolejność" />
              <th className={ocfListThClass}>
                <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                    }}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    aria-label="Zaznacz wszystkie"
                  />
                </label>
              </th>
              <th className={ocfListThSortClass}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1"
                  onClick={() => onIdSortChange(idSort === "asc" ? "desc" : "asc")}
                >
                  ID
                  {idSort === "asc" ? (
                    <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  )}
                </button>
              </th>
              <th className={ocfListThClass}>Nazwa pola</th>
              <th className={`${ocfListThClass} hidden md:table-cell`}>Typ pola</th>
              <th className={`${ocfListThClass} hidden lg:table-cell`}>Rodzaj pola</th>
              <th className={`${ocfListThClass} hidden sm:table-cell text-center`} style={{ width: ocfListIconColWidth }}>
                Ikona
              </th>
              <th className={ocfListThClass} style={{ width: ocfListActionsColWidth }}>
                Akcje
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((adminRow, index) => (
              <SortableFieldRow
                key={adminRow.field.id}
                adminRow={adminRow}
                selected={selectedIds.has(adminRow.field.id)}
                onSelect={onSelect}
                onDelete={onDelete}
                reorderEnabled={reorderEnabled}
                reorderBusy={reorderBusy}
                zebraIndex={index}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {sorted.map((adminRow) => (
          <MobileFieldCard
            key={adminRow.field.id}
            adminRow={adminRow}
            selected={selectedIds.has(adminRow.field.id)}
            onSelect={onSelect}
            onDelete={onDelete}
            reorderBusy={reorderBusy}
          />
        ))}
      </div>
    </>
  );
}

export function orderCustomFieldsSortableIds(rows: OrderCustomFieldAdminRow[]): number[] {
  return rows.map((r) => r.field.id);
}
