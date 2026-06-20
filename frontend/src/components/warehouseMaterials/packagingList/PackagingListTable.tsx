import type { RefObject } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";

import type { PackagingMaterialDto } from "../../../api/packagingMaterialsApi";
import { formatWmMoneyZloty } from "../../../modules/warehouseMaterials/warehouseMaterialsMoney";
import { PROPORTIONAL_TABLE_SYSTEM_WIDTHS } from "../../listPage/proportionalTableColumns";
import { useProportionalTableColumns } from "../../listPage/useProportionalTableColumns";
import { ProductListPhotoCell } from "../../products/ProductListPhotoCell";
import { packagingListColumnLabel } from "./packagingListColumnCatalog";
import {
  PACKAGING_TYPE_LABELS,
  PACKAGING_UNIT_LABELS,
} from "./packagingListFilterTypes";
import {
  packagingListActionsCellClass,
  packagingListActionsInnerClass,
  packagingListActionsThClass,
  packagingListCheckboxCellClass,
  packagingListCheckboxInnerClass,
  packagingListCheckboxInputClass,
  packagingListCheckboxThClass,
  packagingListNameCellClass,
  packagingListNameThClass,
  packagingListPhotoCellClass,
  packagingListPhotoThClass,
  packagingListRowActionBtn,
  packagingListRowActionBtnDanger,
  packagingListRowClass,
  packagingListRowInnerClass,
  packagingListTableClass,
  packagingListTdClass,
  packagingListThClass,
} from "./packagingListTableTokens";

const TABLE_LAYOUT = { ...PROPORTIONAL_TABLE_SYSTEM_WIDTHS, actionsPx: 120 };

export type PackagingListTableProps = {
  rows: PackagingMaterialDto[];
  columnOrder: string[];
  selected: Set<string>;
  deleteBusy: string | null;
  dupBusy: string | null;
  allPageSelected: boolean;
  headerSelectAllRef: RefObject<HTMLInputElement | null>;
  onToggleOne: (id: string) => void;
  onToggleAllPage: () => void;
  onRowOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (row: PackagingMaterialDto) => void;
  onDelete: (row: PackagingMaterialDto) => void;
};

function unitLabel(unit: string): string {
  return PACKAGING_UNIT_LABELS[unit] ?? unit;
}

function DynamicCell({ row, columnId }: { row: PackagingMaterialDto; columnId: string }) {
  const inner = `${packagingListRowInnerClass} min-w-0`;
  switch (columnId) {
    case "sku":
      return (
        <div className={inner}>
          <span className="block truncate font-mono text-xs text-slate-700">{row.sku?.trim() || "—"}</span>
        </div>
      );
    case "type":
      return (
        <div className={inner}>
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {PACKAGING_TYPE_LABELS[row.material_type] ?? row.material_type}
          </span>
        </div>
      );
    case "unit":
      return <div className={inner}>{unitLabel(row.unit)}</div>;
    case "stock":
      return (
        <div className={`${inner} tabular-nums font-medium text-slate-900`}>
          {row.stock ?? 0} {unitLabel(row.unit).toLowerCase()}
        </div>
      );
    case "net_price":
      return (
        <div className={`${inner} justify-end font-mono tabular-nums text-slate-900`}>
          {formatWmMoneyZloty(row.unit_net_price)}
        </div>
      );
    case "gross_price":
      return (
        <div className={`${inner} justify-end font-mono tabular-nums text-slate-800`}>
          {formatWmMoneyZloty(row.unit_gross_price)}
        </div>
      );
    case "supplier":
      return (
        <div className={inner}>
          <span className="block truncate text-slate-800">{row.supplier_name?.trim() || "—"}</span>
        </div>
      );
    case "status":
      return (
        <div className={inner}>
          {row.is_active ? (
            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
              Aktywny
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
              Nieaktywny
            </span>
          )}
        </div>
      );
    case "moq":
      return (
        <div className={`${inner} tabular-nums text-slate-800`}>
          {row.moq != null && Number.isFinite(Number(row.moq)) ? String(row.moq).replace(".", ",") : "—"}
        </div>
      );
    default:
      return <div className={inner}>—</div>;
  }
}

export function PackagingListTable({
  rows,
  columnOrder,
  selected,
  deleteBusy,
  dupBusy,
  allPageSelected,
  headerSelectAllRef,
  onToggleOne,
  onToggleAllPage,
  onRowOpen,
  onEdit,
  onDuplicate,
  onDelete,
}: PackagingListTableProps) {
  const { containerRef, widths, contentMinWidthPx, needsHorizontalScroll } = useProportionalTableColumns(
    columnOrder.length,
    TABLE_LAYOUT,
  );

  const colSpan = 4 + columnOrder.length;
  const scrollClass = needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden";
  const tableStyle = needsHorizontalScroll ? { width: contentMinWidthPx } : undefined;
  const moneyCols = new Set(["net_price", "gross_price"]);

  return (
    <div ref={containerRef} className={`min-w-0 ${scrollClass}`}>
      <table className={packagingListTableClass} style={tableStyle}>
        <colgroup>
          <col style={{ width: widths.checkbox }} />
          <col style={{ width: widths.logo }} />
          <col style={{ width: widths.name }} />
          {columnOrder.map((colId) => (
            <col key={colId} style={{ width: widths.dynamic > 0 ? widths.dynamic : undefined }} />
          ))}
          <col style={{ width: widths.actions }} />
        </colgroup>
        <thead>
          <tr>
            <th className={packagingListCheckboxThClass}>
              <div className={packagingListCheckboxInnerClass}>
                <input
                  ref={headerSelectAllRef}
                  type="checkbox"
                  className={packagingListCheckboxInputClass}
                  checked={allPageSelected}
                  onChange={onToggleAllPage}
                  aria-label="Zaznacz wszystkie na stronie"
                />
              </div>
            </th>
            <th className={packagingListPhotoThClass}>Zdjęcie</th>
            <th className={packagingListNameThClass}>Materiał</th>
            {columnOrder.map((colId) => (
              <th
                key={colId}
                className={`${packagingListThClass} ${moneyCols.has(colId) ? "text-right" : ""}`}
              >
                {packagingListColumnLabel(colId)}
              </th>
            ))}
            <th className={packagingListActionsThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className={`${packagingListTdClass} py-10 text-center text-slate-500`}>
                Brak materiałów spełniających kryteria.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className={packagingListRowClass} onClick={() => onRowOpen(row.id)}>
                <td className={packagingListCheckboxCellClass} onClick={(e) => e.stopPropagation()}>
                  <div className={packagingListCheckboxInnerClass}>
                    <input
                      type="checkbox"
                      className={packagingListCheckboxInputClass}
                      checked={selected.has(row.id)}
                      onChange={() => onToggleOne(row.id)}
                      aria-label={`Zaznacz ${row.name}`}
                    />
                  </div>
                </td>
                <td className={packagingListPhotoCellClass}>
                  <ProductListPhotoCell imageUrl={row.image_url} />
                </td>
                <td className={packagingListNameCellClass}>
                  <div className={`${packagingListRowInnerClass} min-w-0 flex-col !items-start gap-0.5 py-2`}>
                    <span className="block max-w-full truncate text-sm font-medium text-slate-900" title={row.name}>
                      {row.name}
                    </span>
                  </div>
                </td>
                {columnOrder.map((colId) => (
                  <td key={colId} className={packagingListTdClass}>
                    <DynamicCell row={row} columnId={colId} />
                  </td>
                ))}
                <td className={packagingListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                  <div className={packagingListActionsInnerClass}>
                    <button
                      type="button"
                      className={packagingListRowActionBtn}
                      title="Edytuj"
                      aria-label="Edytuj"
                      onClick={() => onEdit(row.id)}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={packagingListRowActionBtn}
                      title="Duplikuj"
                      aria-label="Duplikuj"
                      disabled={dupBusy === row.id}
                      onClick={() => onDuplicate(row)}
                    >
                      <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={packagingListRowActionBtnDanger}
                      title="Usuń"
                      aria-label="Usuń"
                      disabled={deleteBusy === row.id}
                      onClick={() => onDelete(row)}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
