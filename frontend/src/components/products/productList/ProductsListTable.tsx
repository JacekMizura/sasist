import { memo, type RefObject, type ReactNode } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { fmtStockQty } from "../../../api/multiWarehouseUiApi";
import type { FilterFieldCatalogItem } from "../../filters";
import { PROPORTIONAL_TABLE_SYSTEM_WIDTHS } from "../../listPage/proportionalTableColumns";
import { useProportionalTableColumns } from "../../listPage/useProportionalTableColumns";
import { OperationalActionButton, OperationalActionColumn } from "../../operational";
import type { ProductListRow } from "../../../types/productListRow";
import { ProductDispositionStockSummary } from "../ProductDispositionStockSummary";
import { ProductListPhotoCell } from "../ProductListPhotoCell";
import { ProductListLogisticsBadges } from "../../../pages/Products/productListLogisticsBadges";
import {
  formatPlDateShort,
  formatProductDimensionsCm,
  formatProductInventoryValue,
  formatProductLastPurchase,
  formatProductLastSale,
  formatProductListPrice,
  formatProductMargin,
  formatProductPurchasePrice,
  hasPlanVersusPhysicalMismatch,
  isProductDataComplete,
} from "./productListCellPresentation";
import {
  parseWarehouseStockColumnId,
  productListColumnLabel,
  PRODUCT_NETWORK_STOCK_COLUMN_ID,
} from "./productListColumnCatalog";
import {
  physicalInventoryLocations,
  ProductListLocationBadgeStack,
  type OpenLocationOnMapPayload,
} from "./productListLocationCells";
import {
  productsListActionsCellClass,
  productsListCheckboxCellClass,
  productsListCheckboxInnerClass,
  productsListCheckboxInputClass,
  productsListCheckboxThClass,
  productsListNameCellClass,
  productsListPhotoCellClass,
  productsListPhotoThClass,
  productsListRowClass,
  productsListRowInnerClass,
  productsListSortableThClass,
  productsListTableClass,
  productsListTdClass,
  productsListThClass,
  productsListThRightClass,
  productsListActionsThClass,
} from "./productsListTableTokens";

const TABLE_LAYOUT = { ...PROPORTIONAL_TABLE_SYSTEM_WIDTHS, actionsPx: 120 };

export type ProductListSortKey = "id" | "name" | "ean" | "symbol" | "volume" | "weight" | "inventory_value";

export type ProductsListTableProps = {
  rows: ProductListRow[];
  columnOrder: string[];
  columnCatalog?: readonly FilterFieldCatalogItem[];
  sortBy: ProductListSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: ProductListSortKey) => void;
  isRowSelected: (id: number) => boolean;
  headerChecked: boolean;
  headerSelectAllRef: RefObject<HTMLInputElement | null>;
  onToggleOne: (id: number) => void;
  onToggleAllPage: () => void;
  onRowOpen: (row: ProductListRow) => void;
  onDuplicate: (row: ProductListRow) => void;
  onDelete: (row: ProductListRow) => void;
  onOpenLocationOnMap: (payload: OpenLocationOnMapPayload) => void;
  rowDupBusyId: number | null;
  rowDeleteBusyId: number | null;
  emptyAction?: ReactNode;
};

const RIGHT_ALIGN_COLS = new Set([
  "price",
  "purchase_price",
  "stock",
  PRODUCT_NETWORK_STOCK_COLUMN_ID,
  "inventory_value",
  "margin",
]);

function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return null;
  return <span aria-hidden>{dir === "asc" ? " ↑" : " ↓"}</span>;
}

function DynamicCell({
  row,
  columnId,
  columnCatalog,
  onOpenLocationOnMap,
}: {
  row: ProductListRow;
  columnId: string;
  columnCatalog?: readonly FilterFieldCatalogItem[];
  onOpenLocationOnMap: (payload: OpenLocationOnMapPayload) => void;
}) {
  const inner = `${productsListRowInnerClass} min-w-0`;

  switch (columnId) {
    case "sku":
      return (
        <div className={inner}>
          <span className="block truncate font-mono text-xs text-slate-700">{row.symbol?.trim() || "—"}</span>
        </div>
      );
    case "ean":
      return (
        <div className={inner}>
          <span className="block truncate font-mono text-xs text-slate-700">{row.ean?.trim() || "—"}</span>
        </div>
      );
    case "manufacturer": {
      const m = (row.manufacturer_brief?.name ?? row.manufacturer ?? "").trim();
      return (
        <div className={inner}>
          <span className="block truncate text-slate-800">{m || "—"}</span>
        </div>
      );
    }
    case "supplier": {
      const s = (row.default_supplier_brief?.name ?? "").trim();
      return (
        <div className={inner}>
          <span className="block truncate text-slate-800">{s || "—"}</span>
        </div>
      );
    }
    case "category":
      return (
        <div className={inner}>
          <span className="block truncate text-slate-600">—</span>
        </div>
      );
    case "status":
      return (
        <div className={inner}>
          {isProductDataComplete(row) ? (
            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
              Kompletne dane
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
              Niekompletne
            </span>
          )}
        </div>
      );
    case "price":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatProductListPrice(row)}</div>
      );
    case "purchase_price":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatProductPurchasePrice(row)}</div>
      );
    case "margin":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatProductMargin(row)}</div>
      );
    case "dimensions":
      return <div className={`${inner} tabular-nums text-slate-800`}>{formatProductDimensionsCm(row)}</div>;
    case "stock":
      return (
        <div className={`${inner} min-w-0 flex-col !items-end gap-0.5`}>
          {row.disposition_stock ? (
            <ProductDispositionStockSummary
              variant="list"
              disposition={row.disposition_stock}
              reservedQuantity={row.reserved_quantity}
            />
          ) : (
            <span className="tabular-nums text-slate-800">{row.stock_quantity ?? 0}</span>
          )}
        </div>
      );
    case PRODUCT_NETWORK_STOCK_COLUMN_ID:
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>
          {fmtStockQty(row.network_commercially_sellable_qty ?? 0)}
        </div>
      );
    case "inventory_value":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatProductInventoryValue(row)}</div>
      );
    case "locations":
      return (
        <div className={`${inner} min-w-0 flex-col !items-start gap-1 py-2`} onClick={(e) => e.stopPropagation()}>
          <ProductListLocationBadgeStack
            product={row}
            locations={physicalInventoryLocations(row)}
            onOpenLocationOnMap={onOpenLocationOnMap}
          />
        </div>
      );
    case "created_at":
      return (
        <div className={inner}>
          <span className="block truncate text-slate-700">{formatPlDateShort(null)}</span>
        </div>
      );
    case "last_sale":
      return (
        <div className={inner}>
          <span className="block truncate text-slate-700">{formatProductLastSale(row)}</span>
        </div>
      );
    case "last_purchase":
      return (
        <div className={inner}>
          <span className="block truncate text-slate-700">{formatProductLastPurchase(row)}</span>
        </div>
      );
    default: {
      const whColId = parseWarehouseStockColumnId(columnId);
      if (whColId != null) {
        const snap = row.warehouse_stocks?.[String(whColId)] ?? row.warehouse_stocks?.[whColId];
        const qty = snap?.physical_quantity ?? snap?.available_quantity ?? 0;
        return (
          <div className={`${inner} justify-end tabular-nums text-slate-800`}>{fmtStockQty(qty)}</div>
        );
      }
      return (
        <div className={inner}>
          <span className="text-slate-500">{productListColumnLabel(columnId, columnCatalog)}</span>
        </div>
      );
    }
  }
}

type ProductTableRowProps = {
  row: ProductListRow;
  columnOrder: string[];
  columnCatalog?: readonly FilterFieldCatalogItem[];
  selected: boolean;
  onToggleOne: (id: number) => void;
  onRowOpen: (row: ProductListRow) => void;
  onDuplicate: (row: ProductListRow) => void;
  onDelete: (row: ProductListRow) => void;
  onOpenLocationOnMap: (payload: OpenLocationOnMapPayload) => void;
  rowDupBusyId: number | null;
  rowDeleteBusyId: number | null;
};

const ProductTableRow = memo(function ProductTableRow({
  row,
  columnOrder,
  columnCatalog,
  selected,
  onToggleOne,
  onRowOpen,
  onDuplicate,
  onDelete,
  onOpenLocationOnMap,
  rowDupBusyId,
  rowDeleteBusyId,
}: ProductTableRowProps) {
  const mismatch = hasPlanVersusPhysicalMismatch(row);

  return (
    <tr className={productsListRowClass} onClick={() => onRowOpen(row)}>
      <td className={productsListCheckboxCellClass} onClick={(e) => e.stopPropagation()}>
        <div className={productsListCheckboxInnerClass}>
          <input
            type="checkbox"
            className={productsListCheckboxInputClass}
            checked={selected}
            onChange={() => onToggleOne(row.id)}
            aria-label={`Zaznacz ${row.name ?? row.id}`}
          />
        </div>
      </td>
      <td className={productsListPhotoCellClass}>
        <ProductListPhotoCell imageUrl={row.image_url} />
      </td>
      <td className={productsListNameCellClass}>
        <div className={`${productsListRowInnerClass} min-w-0 flex-col !items-start gap-1 py-2`}>
          <span
            className="block max-w-full truncate text-sm font-medium text-slate-900"
            title={row.name?.trim() || undefined}
          >
            {row.name?.trim() || "—"}
          </span>
          {mismatch ? (
            <span className="inline-flex w-fit max-w-full items-center rounded border border-amber-200/80 bg-amber-50/50 px-1.5 py-0.5 text-xs font-medium leading-snug text-amber-900/90">
              Niezgodność plan / stan
            </span>
          ) : null}
          <ProductListLogisticsBadges product={row} />
        </div>
      </td>
      {columnOrder.map((colId) => (
        <td key={colId} className={productsListTdClass}>
          <DynamicCell
            row={row}
            columnId={colId}
            columnCatalog={columnCatalog}
            onOpenLocationOnMap={onOpenLocationOnMap}
          />
        </td>
      ))}
      <td className={productsListActionsCellClass} onClick={(e) => e.stopPropagation()}>
        <OperationalActionColumn
          aria-label="Akcje produktu"
          slots={[
            <OperationalActionButton
              key="dup"
              disabled={rowDupBusyId === row.id}
              title="Duplikuj produkt"
              aria-label="Duplikuj produkt"
              onClick={() => onDuplicate(row)}
            >
              <Copy strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
            <OperationalActionButton
              key="edit"
              title="Edytuj produkt"
              aria-label="Edytuj produkt"
              onClick={() => onRowOpen(row)}
            >
              <Pencil strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
            <OperationalActionButton
              key="del"
              variant="danger"
              disabled={rowDeleteBusyId === row.id}
              onClick={() => onDelete(row)}
              title="Usuń / zarchiwizuj"
              aria-label="Usuń produkt"
            >
              <Trash2 strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
          ]}
        />
      </td>
    </tr>
  );
});

export function ProductsListTable({
  rows,
  columnOrder,
  columnCatalog,
  sortBy,
  sortDir,
  onSort,
  isRowSelected,
  headerChecked,
  headerSelectAllRef,
  onToggleOne,
  onToggleAllPage,
  onRowOpen,
  onDuplicate,
  onDelete,
  onOpenLocationOnMap,
  rowDupBusyId,
  rowDeleteBusyId,
}: ProductsListTableProps) {
  const { containerRef, widths, contentMinWidthPx, needsHorizontalScroll } = useProportionalTableColumns(
    columnOrder.length,
    TABLE_LAYOUT,
  );

  const colSpan = 4 + columnOrder.length;
  const scrollClass = needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden";
  const tableStyle = needsHorizontalScroll ? { width: contentMinWidthPx } : undefined;

  const renderSortTh = (label: string, sortKey: ProductListSortKey, align: "left" | "right" = "left") => (
    <th
      key={sortKey}
      className={`${align === "right" ? productsListThRightClass : productsListThClass} ${productsListSortableThClass}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <SortIndicator active={sortBy === sortKey} dir={sortDir} />
    </th>
  );

  return (
    <div ref={containerRef} className={`min-w-0 ${scrollClass}`}>
      <table className={productsListTableClass} style={tableStyle}>
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
            <th className={productsListCheckboxThClass}>
              <div className={productsListCheckboxInnerClass}>
                <input
                  ref={headerSelectAllRef}
                  type="checkbox"
                  className={productsListCheckboxInputClass}
                  checked={headerChecked}
                  onChange={onToggleAllPage}
                  aria-label="Zaznacz wszystkie na stronie"
                />
              </div>
            </th>
            <th className={productsListPhotoThClass}>Zdjęcie</th>
            {renderSortTh("Nazwa", "name")}
            {columnOrder.map((colId) => {
              if (colId === "inventory_value") {
                return renderSortTh(productListColumnLabel(colId, columnCatalog), "inventory_value", "right");
              }
              const align = RIGHT_ALIGN_COLS.has(colId) ? "right" : "left";
              return (
                <th
                  key={colId}
                  className={align === "right" ? productsListThRightClass : productsListThClass}
                >
                  {productListColumnLabel(colId, columnCatalog)}
                </th>
              );
            })}
            <th className={productsListActionsThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className={`${productsListTdClass} py-12 text-center text-slate-500`}>
                <p>Brak produktów do wyświetlenia.</p>
                <Link
                  to="/products/new"
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  Dodaj produkt
                </Link>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <ProductTableRow
                key={row.id}
                row={row}
                columnOrder={columnOrder}
                columnCatalog={columnCatalog}
                selected={isRowSelected(row.id)}
                onToggleOne={onToggleOne}
                onRowOpen={onRowOpen}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onOpenLocationOnMap={onOpenLocationOnMap}
                rowDupBusyId={rowDupBusyId}
                rowDeleteBusyId={rowDeleteBusyId}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
