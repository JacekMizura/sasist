import { Link, useNavigate } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";

import type { OrderCustomFieldDto } from "../../../api/orderCustomFieldsApi";
import { AdminDataTable, type AdminDataTableColumn } from "../../admin/AdminDataTable";
import {
  adminListIconColWidth,
  adminListRowActionBtn,
  adminListRowActionBtnDanger,
} from "../../admin/adminDataTableTokens";
import { FieldIcon } from "./FieldIcon";
import {
  orderCustomFieldKindLabel,
  orderCustomFieldTypeLabel,
  type OrderCustomFieldAdminRow,
} from "../../../utils/orderCustomFieldListPresentation";

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
  const navigate = useNavigate();

  const columns: AdminDataTableColumn<OrderCustomFieldAdminRow>[] = [
    {
      id: "type",
      header: "Typ pola",
      width: "14%",
      hideBelow: "md",
      className: "text-slate-700",
      cell: (r) => orderCustomFieldTypeLabel(r.field.type),
    },
    {
      id: "kind",
      header: "Rodzaj pola",
      width: "16%",
      hideBelow: "lg",
      className: "text-slate-600",
      cell: (r) =>
        orderCustomFieldKindLabel(r.field.type, r.field.settings_json as Record<string, unknown> | null),
    },
    {
      id: "icon",
      header: "Ikona",
      width: adminListIconColWidth,
      hideBelow: "sm",
      headerClassName: "text-center",
      className: "w-full justify-center",
      cell: (r) => <FieldIcon field={r.field} />,
    },
  ];

  return (
    <AdminDataTable
      rows={rows}
      getRowId={(r) => r.field.id}
      getRowName={(r) => r.field.name}
      columns={columns}
      selectedIds={selectedIds}
      onSelect={onSelect}
      onSelectAll={onSelectAll}
      allVisibleSelected={allVisibleSelected}
      someVisibleSelected={someVisibleSelected}
      nameHeader="Nazwa pola"
      onNameClick={(r) => navigate(`/orders/custom-fields/${r.field.id}/edit`)}
      editTo={(r) => `/orders/custom-fields/${r.field.id}/edit`}
      onDelete={(r) => onDelete(r.field)}
      reorderEnabled={reorderEnabled}
      reorderBusy={reorderBusy}
      idSort={idSort}
      onIdSortChange={onIdSortChange}
      renderMobileCard={(adminRow, ctx) => {
        const row = adminRow.field;
        const settings = (row.settings_json ?? {}) as Record<string, unknown>;
        return (
          <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <label className="mt-1 inline-flex shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                  checked={ctx.selected}
                  onChange={(e) => ctx.onSelect(row.id, e.target.checked)}
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
                    className={adminListRowActionBtn}
                    title="Edytuj"
                    aria-label="Edytuj"
                  >
                    <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />
                  </Link>
                  <button
                    type="button"
                    className={adminListRowActionBtnDanger}
                    title="Usuń"
                    aria-label="Usuń"
                    disabled={ctx.reorderBusy}
                    onClick={() => ctx.onDelete?.(adminRow)}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      }}
    />
  );
}

export function orderCustomFieldsSortableIds(rows: OrderCustomFieldAdminRow[]): number[] {
  return rows.map((r) => r.field.id);
}
