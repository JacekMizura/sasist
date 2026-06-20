import type { RefObject } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import type { BundleRead } from "../../../api/bundlesApi";
import { PROPORTIONAL_TABLE_SYSTEM_WIDTHS } from "../../listPage/proportionalTableColumns";
import { useProportionalTableColumns } from "../../listPage/useProportionalTableColumns";
import {
  OperationalActionButton,
  OperationalActionColumn,
} from "../../operational";
import { ProductListPhotoCell } from "../../products/ProductListPhotoCell";
import { bundleStockBreakdownTooltip, formatBundlePriceZl } from "./bundleListPresentation";
import {
  bundlesListActionsCellClass,
  bundlesListActionsThClass,
  bundlesListCheckboxCellClass,
  bundlesListCheckboxInnerClass,
  bundlesListCheckboxInputClass,
  bundlesListCheckboxThClass,
  bundlesListNameCellClass,
  bundlesListNameThClass,
  bundlesListPhotoCellClass,
  bundlesListPhotoThClass,
  bundlesListRowClass,
  bundlesListRowInnerClass,
  bundlesListTableClass,
  bundlesListTdClass,
  bundlesListThClass,
  bundlesListThRightClass,
} from "./bundlesListTableTokens";

const DYNAMIC_COLUMNS = ["ean_sku", "price", "stock"] as const;
const TABLE_LAYOUT = { ...PROPORTIONAL_TABLE_SYSTEM_WIDTHS, actionsPx: 120 };

export type BundlesListTableProps = {
  rows: BundleRead[];
  isRowSelected: (id: number) => boolean;
  headerChecked: boolean;
  headerSelectAllRef: RefObject<HTMLInputElement | null>;
  deleteBusy: boolean;
  onToggleOne: (id: number) => void;
  onToggleAllPage: () => void;
  onRowOpen: (id: number) => void;
  onPreview: (row: BundleRead) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

function DynamicCell({ row, columnId }: { row: BundleRead; columnId: (typeof DYNAMIC_COLUMNS)[number] }) {
  const inner = `${bundlesListRowInnerClass} min-w-0`;
  switch (columnId) {
    case "ean_sku":
      return (
        <div className={`${inner} flex-col !items-start gap-0.5 py-2`}>
          <span className="tabular-nums text-slate-800">{(row.ean ?? "").trim() || "—"}</span>
          <span className="block max-w-full truncate text-xs text-slate-500" title={(row.sku ?? "").trim()}>
            {(row.sku ?? "").trim() || "—"}
          </span>
        </div>
      );
    case "price":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-800`}>{formatBundlePriceZl(row)}</div>
      );
    case "stock": {
      const stockVal = row.calculated_stock ?? 0;
      return (
        <div className={inner}>
          <span
            className={`text-sm tabular-nums ${stockVal === 0 ? "font-medium text-red-600" : "text-slate-800"}`}
            title={bundleStockBreakdownTooltip(row)}
          >
            {`${stockVal} szt.`}
          </span>
        </div>
      );
    }
    default:
      return <div className={inner}>—</div>;
  }
}

export function BundlesListTable({
  rows,
  isRowSelected,
  headerChecked,
  headerSelectAllRef,
  deleteBusy,
  onToggleOne,
  onToggleAllPage,
  onRowOpen,
  onPreview,
  onEdit,
  onDelete,
}: BundlesListTableProps) {
  const { containerRef, widths, contentMinWidthPx, needsHorizontalScroll } = useProportionalTableColumns(
    DYNAMIC_COLUMNS.length,
    TABLE_LAYOUT,
  );

  const colSpan = 4 + DYNAMIC_COLUMNS.length;
  const scrollClass = needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden";
  const tableStyle = needsHorizontalScroll ? { width: contentMinWidthPx } : undefined;

  return (
    <div ref={containerRef} className={`min-w-0 ${scrollClass}`}>
      <table className={bundlesListTableClass} style={tableStyle}>
        <colgroup>
          <col style={{ width: widths.checkbox }} />
          <col style={{ width: widths.logo }} />
          <col style={{ width: widths.name }} />
          {DYNAMIC_COLUMNS.map((colId) => (
            <col key={colId} style={{ width: widths.dynamic > 0 ? widths.dynamic : undefined }} />
          ))}
          <col style={{ width: widths.actions }} />
        </colgroup>
        <thead>
          <tr>
            <th className={bundlesListCheckboxThClass}>
              <div className={bundlesListCheckboxInnerClass}>
                <input
                  ref={headerSelectAllRef}
                  type="checkbox"
                  className={bundlesListCheckboxInputClass}
                  checked={headerChecked}
                  disabled={deleteBusy || rows.length === 0}
                  onChange={onToggleAllPage}
                  aria-label="Zaznacz wszystkie zestawy na stronie"
                />
              </div>
            </th>
            <th className={bundlesListPhotoThClass}>Zdjęcie</th>
            <th className={bundlesListNameThClass}>Nazwa</th>
            <th className={bundlesListThClass}>EAN / SKU</th>
            <th className={bundlesListThRightClass}>Cena</th>
            <th className={bundlesListThClass}>Stan</th>
            <th className={bundlesListActionsThClass}>Akcje</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const nComp = row.items.length;
            return (
              <tr key={row.id} className={bundlesListRowClass} onClick={() => onRowOpen(row.id)}>
                <td className={bundlesListCheckboxCellClass} onClick={(e) => e.stopPropagation()}>
                  <div className={bundlesListCheckboxInnerClass}>
                    <input
                      type="checkbox"
                      className={bundlesListCheckboxInputClass}
                      checked={isRowSelected(row.id)}
                      disabled={deleteBusy}
                      onChange={() => onToggleOne(row.id)}
                      aria-label={`Zaznacz zestaw ${row.name}`}
                    />
                  </div>
                </td>
                <td className={bundlesListPhotoCellClass}>
                  <ProductListPhotoCell imageUrl={row.image_url} />
                </td>
                <td className={bundlesListNameCellClass}>
                  <div className={`${bundlesListRowInnerClass} min-w-0 flex-col !items-start gap-1 py-2`}>
                    <Link
                      to={`/bundles/${row.id}/edit`}
                      className="block max-w-full truncate text-sm font-medium text-slate-900 hover:text-slate-700 hover:underline"
                      title={row.name}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.name}
                    </Link>
                    {!row.active ? (
                      <span className="inline-flex w-fit max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                        Nieaktywny
                      </span>
                    ) : null}
                    <span
                      className="w-fit text-xs text-slate-500 underline decoration-dotted decoration-slate-400 underline-offset-2"
                      title={bundleStockBreakdownTooltip(row)}
                    >
                      {nComp} składnik{nComp === 1 ? "" : nComp < 5 ? "i" : "ów"}
                    </span>
                  </div>
                </td>
                {DYNAMIC_COLUMNS.map((colId) => (
                  <td key={colId} className={bundlesListTdClass}>
                    <DynamicCell row={row} columnId={colId} />
                  </td>
                ))}
                <td className={bundlesListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                  <OperationalActionColumn
                    aria-label="Akcje zestawu"
                    slots={[
                        <OperationalActionButton
                          key="preview"
                          onClick={() => onPreview(row)}
                          title="Podgląd składu"
                          aria-label="Podgląd składu"
                        >
                          <Eye className="text-slate-600" strokeWidth={2} aria-hidden />
                        </OperationalActionButton>,
                        <OperationalActionButton
                          key="edit"
                          onClick={() => onEdit(row.id)}
                          title="Edytuj zestaw"
                          aria-label="Edytuj zestaw"
                        >
                          <Pencil className="text-slate-600" strokeWidth={2} aria-hidden />
                        </OperationalActionButton>,
                        <OperationalActionButton
                          key="del"
                          variant="danger"
                          disabled={deleteBusy}
                          onClick={() => onDelete(row.id)}
                          title="Usuń zestaw"
                          aria-label="Usuń zestaw"
                        >
                          <Trash2 strokeWidth={2} aria-hidden />
                        </OperationalActionButton>,
                      ]}
                    />
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className={`${bundlesListTdClass} py-10 text-center text-slate-500`}>
                Brak zestawów na tej stronie.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
