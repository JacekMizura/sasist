import { Link, useNavigate } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";

import type { ProductCustomFieldDto } from "../../../api/productCustomFieldsApi";
import { AdminDataTable, type AdminDataTableColumn } from "../../../components/admin/AdminDataTable";
import {
  adminListRowActionBtn,
  adminListRowActionBtnDanger,
} from "../../../components/admin/adminDataTableTokens";

const TYPE_LABEL: Record<string, string> = {
  TEXT: "Tekst",
  NUMBER: "Liczba",
  FILES: "Pliki",
  SELECT_SINGLE: "Lista",
  SELECT_MULTI: "Lista",
  GPSR_ATTACHMENTS: "GPSR",
  ATTACHMENTS: "Załączniki",
};

const KIND_LABEL: Record<string, string> = {
  TEXT: "Pole tekstowe",
  NUMBER: "Pole liczbowe",
  FILES: "Pliki",
  SELECT_SINGLE: "Jednokrotny wybór",
  SELECT_MULTI: "Wielokrotny wybór",
  GPSR_ATTACHMENTS: "Instrukcja bezpieczeństwa (GPSR)",
  ATTACHMENTS: "Załączniki",
};

export type ProductCustomFieldsTableProps = {
  rows: ProductCustomFieldDto[];
  selectedIds: Set<number>;
  idSort: "asc" | "desc";
  onIdSortChange: (dir: "asc" | "desc") => void;
  onSelect: (id: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onDelete: (row: ProductCustomFieldDto) => void;
  reorderEnabled: boolean;
  reorderBusy: boolean;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
};

/**
 * Same AdminDataTable chrome as OrderCustomFieldsTable — product-specific columns only.
 */
export function ProductCustomFieldsTable({
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
}: ProductCustomFieldsTableProps) {
  const navigate = useNavigate();

  const columns: AdminDataTableColumn<ProductCustomFieldDto>[] = [
    {
      id: "type",
      header: "Typ pola",
      width: "14%",
      hideBelow: "md",
      className: "text-slate-700",
      cell: (r) => TYPE_LABEL[r.type] ?? r.type,
    },
    {
      id: "kind",
      header: "Rodzaj",
      width: "18%",
      hideBelow: "lg",
      className: "text-slate-600",
      cell: (r) => KIND_LABEL[r.type] ?? r.type,
    },
    {
      id: "active",
      header: "Aktywne",
      width: "10%",
      hideBelow: "sm",
      cell: (r) =>
        r.is_active ? (
          <span className="font-medium text-emerald-700">Tak</span>
        ) : (
          <span className="text-slate-400">Nie</span>
        ),
    },
  ];

  return (
    <AdminDataTable
      rows={rows}
      getRowId={(r) => r.id}
      getRowName={(r) => r.name}
      columns={columns}
      selectedIds={selectedIds}
      onSelect={onSelect}
      onSelectAll={onSelectAll}
      allVisibleSelected={allVisibleSelected}
      someVisibleSelected={someVisibleSelected}
      nameHeader="Nazwa pola"
      onNameClick={(r) => navigate(`/product-custom-fields/${r.id}/edit`)}
      editTo={(r) => `/product-custom-fields/${r.id}/edit`}
      onDelete={onDelete}
      reorderEnabled={reorderEnabled}
      reorderBusy={reorderBusy}
      idSort={idSort}
      onIdSortChange={onIdSortChange}
      renderMobileCard={(row, ctx) => (
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
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-slate-900 hover:text-slate-700"
                    onClick={() => navigate(`/product-custom-fields/${row.id}/edit`)}
                  >
                {row.name}
              </button>
              <p className="mt-1 font-mono text-xs tabular-nums text-slate-500">ID {row.id}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Typ</dt>
                  <dd className="text-slate-700">{TYPE_LABEL[row.type] ?? row.type}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rodzaj</dt>
                  <dd className="text-slate-600">{KIND_LABEL[row.type] ?? row.type}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Aktywne</dt>
                  <dd className="text-slate-700">{row.is_active ? "Tak" : "Nie"}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-row items-center justify-end gap-2">
                <Link
                  to={`/product-custom-fields/${row.id}/edit`}
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
                  onClick={() => ctx.onDelete?.(row)}
                >
                  <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </article>
      )}
    />
  );
}

export function productCustomFieldsSortableIds(rows: ProductCustomFieldDto[]): number[] {
  return rows.map((r) => r.id);
}
