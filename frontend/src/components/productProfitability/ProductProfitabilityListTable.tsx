import { Eye } from "lucide-react";

import type { ProductProfitabilityRow } from "../../api/productProfitabilityApi";
import {
  PROPORTIONAL_TABLE_NO_LOGO,
  PROPORTIONAL_TABLE_SYSTEM_WIDTHS,
} from "../listPage/proportionalTableColumns";
import { useProportionalTableColumns } from "../listPage/useProportionalTableColumns";
import { ProductListPhotoCell } from "../products/ProductListPhotoCell";
import { productProfitabilityColumnLabel } from "./productProfitabilityColumnCatalog";
import {
  profitabilityListActionsCellClass,
  profitabilityListActionsInnerClass,
  profitabilityListActionsThClass,
  profitabilityListNameCellClass,
  profitabilityListNameThClass,
  profitabilityListPhotoCellClass,
  profitabilityListPhotoThClass,
  profitabilityListRowActionBtn,
  profitabilityListRowClass,
  profitabilityListRowInnerClass,
  profitabilityListTableClass,
  profitabilityListTdClass,
  profitabilityListThClass,
} from "./productProfitabilityListTableTokens";

const TABLE_LAYOUT = {
  ...PROPORTIONAL_TABLE_SYSTEM_WIDTHS,
  ...PROPORTIONAL_TABLE_NO_LOGO,
  checkboxPx: 0,
  logoPx: 80,
  actionsPx: 80,
};

export type ProductProfitabilityListTableProps = {
  rows: ProductProfitabilityRow[];
  columnOrder: string[];
  loading: boolean;
  error: string | null;
  onRowOpen: (row: ProductProfitabilityRow) => void;
  formatMoney: (v: number | null | undefined) => string;
  formatQty: (v: number | null | undefined) => string;
  formatPct: (v: number | null | undefined) => string;
};

function DynamicCell({
  row,
  columnId,
  formatMoney,
  formatQty,
  formatPct,
}: {
  row: ProductProfitabilityRow;
  columnId: string;
  formatMoney: (v: number | null | undefined) => string;
  formatQty: (v: number | null | undefined) => string;
  formatPct: (v: number | null | undefined) => string;
}) {
  const inner = `${profitabilityListRowInnerClass} min-w-0`;
  const warehouseValue =
    row.landed_cost_net != null && Number.isFinite(row.landed_cost_net)
      ? row.stock_qty * row.landed_cost_net
      : row.frozen_capital;

  switch (columnId) {
    case "sku":
      return (
        <div className={inner}>
          <span className="block truncate font-mono text-xs text-slate-700">{row.sku?.trim() || "—"}</span>
        </div>
      );
    case "ean":
      return (
        <div className={inner}>
          <span className="block truncate font-mono text-xs text-slate-700">{row.ean?.trim() || "—"}</span>
        </div>
      );
    case "stock":
      return (
        <div className={`${inner} tabular-nums`}>{formatQty(row.stock_qty)}</div>
      );
    case "sold":
      return (
        <div className={`${inner} tabular-nums`}>{formatQty(row.sold_qty)}</div>
      );
    case "revenue_net":
      return (
        <div className={`${inner} justify-end tabular-nums font-medium text-slate-900`}>{formatMoney(row.revenue_net)}</div>
      );
    case "cost_of_goods":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatMoney(row.cost_of_goods)}</div>
      );
    case "profit":
      return (
        <div className={`${inner} justify-end tabular-nums font-medium text-slate-900`}>{formatMoney(row.profit_value)}</div>
      );
    case "margin":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatPct(row.margin_percent)}</div>
      );
    case "sale_gross":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatMoney(row.sale_gross)}</div>
      );
    case "landed_cost_net":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatMoney(row.landed_cost_net)}</div>
      );
    case "warehouse_value":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatMoney(warehouseValue)}</div>
      );
    case "frozen_capital":
      return (
        <div className={`${inner} justify-end tabular-nums font-medium text-slate-900`}>{formatMoney(row.frozen_capital)}</div>
      );
    case "last_sale":
    case "last_purchase":
      return (
        <div className={`${inner} text-slate-500`}>—</div>
      );
    default:
      return <div className={inner}>—</div>;
  }
}

export function ProductProfitabilityListTable({
  rows,
  columnOrder,
  loading,
  error,
  onRowOpen,
  formatMoney,
  formatQty,
  formatPct,
}: ProductProfitabilityListTableProps) {
  const { containerRef, widths, contentMinWidthPx, needsHorizontalScroll } = useProportionalTableColumns(
    columnOrder.length,
    TABLE_LAYOUT,
  );

  const colSpan = 3 + columnOrder.length;
  const scrollClass = needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden";
  const tableStyle = needsHorizontalScroll ? { width: contentMinWidthPx } : undefined;

  return (
    <div ref={containerRef} className={`min-w-0 ${scrollClass}`}>
      <table className={profitabilityListTableClass} style={tableStyle}>
        <colgroup>
          <col style={{ width: widths.logo }} />
          <col style={{ width: widths.name }} />
          {columnOrder.map((colId) => (
            <col key={colId} style={{ width: widths.dynamic > 0 ? widths.dynamic : undefined }} />
          ))}
          <col style={{ width: widths.actions }} />
        </colgroup>
        <thead>
          <tr>
            <th className={profitabilityListPhotoThClass}>Zdjęcie</th>
            <th className={profitabilityListNameThClass}>Produkt</th>
            {columnOrder.map((colId) => (
              <th
                key={colId}
                className={`${profitabilityListThClass} ${
                  ["revenue_net", "cost_of_goods", "profit", "margin", "sale_gross", "landed_cost_net", "warehouse_value", "frozen_capital"].includes(colId)
                    ? "text-right"
                    : ""
                }`}
              >
                {productProfitabilityColumnLabel(colId)}
              </th>
            ))}
            <th className={profitabilityListActionsThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className={`${profitabilityListTdClass} py-10 text-center text-slate-500`}>
                Ładowanie…
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={colSpan} className={`${profitabilityListTdClass} py-10 text-center text-rose-600`}>
                {error}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className={`${profitabilityListTdClass} py-10 text-center text-slate-500`}>
                Brak danych dla wybranych filtrów.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.product_id} className={profitabilityListRowClass} onClick={() => onRowOpen(row)}>
                <td className={profitabilityListPhotoCellClass}>
                  <ProductListPhotoCell imageUrl={row.image_url} />
                </td>
                <td className={profitabilityListNameCellClass}>
                  <div className={`${profitabilityListRowInnerClass} min-w-0 flex-col !items-start gap-0.5 py-2`}>
                    <span className="block max-w-full truncate text-sm font-medium text-slate-900" title={row.product_name}>
                      {row.product_name}
                    </span>
                  </div>
                </td>
                {columnOrder.map((colId) => (
                  <td key={colId} className={profitabilityListTdClass}>
                    <DynamicCell
                      row={row}
                      columnId={colId}
                      formatMoney={formatMoney}
                      formatQty={formatQty}
                      formatPct={formatPct}
                    />
                  </td>
                ))}
                <td className={profitabilityListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                  <div className={profitabilityListActionsInnerClass}>
                    <button
                      type="button"
                      className={profitabilityListRowActionBtn}
                      title="Szczegóły"
                      aria-label="Szczegóły"
                      onClick={() => onRowOpen(row)}
                    >
                      <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />
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
