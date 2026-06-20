import type { RefObject } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";

import type { CartonDto } from "../../../api/cartonsApi";
import { formatWmMoneyZloty } from "../../../modules/warehouseMaterials/warehouseMaterialsMoney";
import { ShippingMethodBadgeRow } from "../../wms/packing/PackingCartonHints";
import { PROPORTIONAL_TABLE_SYSTEM_WIDTHS } from "../../listPage/proportionalTableColumns";
import { useProportionalTableColumns } from "../../listPage/useProportionalTableColumns";
import { ProductListPhotoCell } from "../../products/ProductListPhotoCell";
import { cartonsListColumnLabel } from "./cartonsListColumnCatalog";
import {
  cartonsListActionsCellClass,
  cartonsListActionsInnerClass,
  cartonsListActionsThClass,
  cartonsListCheckboxCellClass,
  cartonsListCheckboxInnerClass,
  cartonsListCheckboxInputClass,
  cartonsListCheckboxThClass,
  cartonsListNameCellClass,
  cartonsListNameThClass,
  cartonsListPhotoCellClass,
  cartonsListPhotoThClass,
  cartonsListRowActionBtn,
  cartonsListRowActionBtnDanger,
  cartonsListRowClass,
  cartonsListRowInnerClass,
  cartonsListTableClass,
  cartonsListTdClass,
  cartonsListThClass,
} from "./cartonsListTableTokens";

const TABLE_LAYOUT = { ...PROPORTIONAL_TABLE_SYSTEM_WIDTHS, actionsPx: 120 };

export type CartonsListTableProps = {
  rows: CartonDto[];
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
  onDuplicate: (row: CartonDto) => void;
  onDelete: (row: CartonDto) => void;
};

function DynamicCell({ row, columnId }: { row: CartonDto; columnId: string }) {
  const inner = `${cartonsListRowInnerClass} min-w-0`;
  switch (columnId) {
    case "sku":
      return (
        <div className={inner}>
          <span className="block truncate font-mono text-xs text-slate-700">{row.sku?.trim() || "—"}</span>
        </div>
      );
    case "dimensions":
      return (
        <div className={`${inner} tabular-nums text-slate-800`}>
          {row.length_cm} × {row.width_cm} × {row.height_cm} cm
        </div>
      );
    case "stock":
      return (
        <div className={`${inner} tabular-nums font-medium text-slate-900`}>{row.stock ?? 0} szt.</div>
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
    case "moq":
      return (
        <div className={`${inner} tabular-nums text-slate-800`}>
          {row.moq != null && Number.isFinite(Number(row.moq)) ? String(row.moq).replace(".", ",") : "—"}
        </div>
      );
    case "last_purchase":
      return (
        <div className={`${inner} justify-end font-mono tabular-nums text-slate-800`}>
          {formatWmMoneyZloty(row.last_purchase_price_net)}
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
    case "material_type":
      return (
        <div className={inner}>
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {(row.material_type || "Karton").trim() || "Karton"}
          </span>
        </div>
      );
    case "shipping":
      return (
        <div className={`${inner} min-w-[8rem]`} onClick={(e) => e.stopPropagation()}>
          <ShippingMethodBadgeRow methods={row.shipping_methods} />
        </div>
      );
    default:
      return <div className={inner}>—</div>;
  }
}

export function CartonsListTable({
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
}: CartonsListTableProps) {
  const { containerRef, widths, contentMinWidthPx, needsHorizontalScroll } = useProportionalTableColumns(
    columnOrder.length,
    TABLE_LAYOUT,
  );

  const colSpan = 4 + columnOrder.length;
  const scrollClass = needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden";
  const tableStyle = needsHorizontalScroll ? { width: contentMinWidthPx } : undefined;
  const moneyCols = new Set(["net_price", "gross_price", "last_purchase"]);

  return (
    <div ref={containerRef} className={`min-w-0 ${scrollClass}`}>
      <table className={cartonsListTableClass} style={tableStyle}>
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
            <th className={cartonsListCheckboxThClass}>
              <div className={cartonsListCheckboxInnerClass}>
                <input
                  ref={headerSelectAllRef}
                  type="checkbox"
                  className={cartonsListCheckboxInputClass}
                  checked={allPageSelected}
                  onChange={onToggleAllPage}
                  aria-label="Zaznacz wszystkie na stronie"
                />
              </div>
            </th>
            <th className={cartonsListPhotoThClass}>Zdjęcie</th>
            <th className={cartonsListNameThClass}>Karton</th>
            {columnOrder.map((colId) => (
              <th
                key={colId}
                className={`${cartonsListThClass} ${moneyCols.has(colId) ? "text-right" : ""}`}
              >
                {cartonsListColumnLabel(colId)}
              </th>
            ))}
            <th className={cartonsListActionsThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className={`${cartonsListTdClass} py-10 text-center text-slate-500`}>
                Brak kartonów spełniających kryteria.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className={cartonsListRowClass} onClick={() => onRowOpen(row.id)}>
                <td className={cartonsListCheckboxCellClass} onClick={(e) => e.stopPropagation()}>
                  <div className={cartonsListCheckboxInnerClass}>
                    <input
                      type="checkbox"
                      className={cartonsListCheckboxInputClass}
                      checked={selected.has(row.id)}
                      onChange={() => onToggleOne(row.id)}
                      aria-label={`Zaznacz ${row.name}`}
                    />
                  </div>
                </td>
                <td className={cartonsListPhotoCellClass}>
                  <ProductListPhotoCell imageUrl={row.image_url} />
                </td>
                <td className={cartonsListNameCellClass}>
                  <div className={`${cartonsListRowInnerClass} min-w-0 flex-col !items-start gap-0.5 py-2`}>
                    <span className="block max-w-full truncate text-sm font-medium text-slate-900" title={row.name}>
                      {row.name}
                    </span>
                  </div>
                </td>
                {columnOrder.map((colId) => (
                  <td key={colId} className={cartonsListTdClass}>
                    <DynamicCell row={row} columnId={colId} />
                  </td>
                ))}
                <td className={cartonsListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                  <div className={cartonsListActionsInnerClass}>
                    <button
                      type="button"
                      className={cartonsListRowActionBtn}
                      title="Edytuj"
                      aria-label="Edytuj"
                      onClick={() => onEdit(row.id)}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cartonsListRowActionBtn}
                      title="Duplikuj"
                      aria-label="Duplikuj"
                      disabled={dupBusy === row.id}
                      onClick={() => onDuplicate(row)}
                    >
                      <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cartonsListRowActionBtnDanger}
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
