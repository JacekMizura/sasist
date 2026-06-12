import type { ReactNode } from "react";
import { MagazynInventoryLine, magazynInventoryRowReactKey, type MagazynInvRowDisplay } from "./MagazynInventoryLine";
import { ProductDispositionStockSummary } from "./ProductDispositionStockSummary";
import { WarehouseFormCard } from "./WarehouseFormCard";
import type { ProductDispositionStock } from "../../types/productDispositionStock";

const fieldLabel = "block text-sm font-medium text-slate-700 mb-1";
const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-400";

export type ProductWarehouseStockPanelProps = {
  physicalStockDisplay: string | null;
  /** Total on-hand (same as stock_quantity). When set, shown as „Stan całkowity”. */
  totalStockDisplay?: string | null;
  /** Sum of quantities on named location rows. */
  allocatedStockDisplay?: string | null;
  /** max(0, total - allocated) — stock not attributed to listed bins. */
  unallocatedStockDisplay?: string | null;
  /** When set with `availableDisplay`, shows three-line summary (carton). Omit for classic product copy. */
  reservedDisplay?: string | null;
  availableDisplay?: string | null;
  /** Etap 1 disposition breakdown — when set, replaces legacy single-line stock in product panel. */
  dispositionStock?: ProductDispositionStock | null;
  commerciallySellableQty?: number | null;
  salesBlockedQty?: number | null;
  /** Sum of commercially_sellable_qty across network-participating warehouses (product detail only). */
  networkCommerciallySellableQty?: number | null;
  inventoryRows: MagazynInvRowDisplay[];
  onEditTraceability?: (row: MagazynInvRowDisplay) => void;
  traceabilityEditDisabled?: boolean;
  showInventoryLink?: boolean;
  /** When true, shows active „Korekta stanu” button (HYBRID). */
  canManualAdjustStock?: boolean;
  onManualAdjustClick?: () => void;
  editorSlot?: ReactNode;
  /** Override empty-state copy for the locations card (default: product wording). */
  emptyLocationsMessage?: string;
};

/**
 * Same structure as the product edit modal „Magazyn” tab (stan + lokalizacje).
 * Products: only „Stan fizyczny” line + inventory link (unchanged copy).
 * Cartons: optional reserved + available lines + editor slot.
 */
export function ProductWarehouseStockPanel({
  physicalStockDisplay,
  totalStockDisplay,
  allocatedStockDisplay,
  unallocatedStockDisplay,
  reservedDisplay,
  availableDisplay,
  dispositionStock,
  commerciallySellableQty,
  salesBlockedQty,
  networkCommerciallySellableQty,
  inventoryRows,
  onEditTraceability,
  traceabilityEditDisabled = false,
  showInventoryLink = false,
  canManualAdjustStock = false,
  onManualAdjustClick,
  editorSlot,
  emptyLocationsMessage = "Brak stanu magazynowego",
}: ProductWarehouseStockPanelProps) {
  const showThree = reservedDisplay != null && availableDisplay != null;
  const showBreakdown =
    totalStockDisplay != null && allocatedStockDisplay != null && unallocatedStockDisplay != null;

  const showDisposition = dispositionStock != null;

  return (
    <div className="space-y-6">
      <WarehouseFormCard title="Stan fizyczny">
        {showDisposition ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <ProductDispositionStockSummary
                variant="panel"
                disposition={dispositionStock}
                reservedQuantity={
                  reservedDisplay != null && reservedDisplay !== ""
                    ? Number(reservedDisplay)
                    : undefined
                }
              />
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-sm font-medium text-slate-800">Fizycznie:</span>
                <span className="font-bold tabular-nums text-slate-900">
                  {physicalStockDisplay != null ? `${physicalStockDisplay} szt.` : "—"}
                </span>
              </div>
            </div>
            {commerciallySellableQty != null || (salesBlockedQty != null && salesBlockedQty > 0) ? (
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm space-y-1">
                <p className="text-slate-700">
                  Dostępne handlowo (magazyn bieżący):{" "}
                  <span className="font-semibold tabular-nums text-emerald-800">
                    {commerciallySellableQty != null
                      ? new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(
                          commerciallySellableQty,
                        )
                      : "—"}{" "}
                    szt.
                  </span>
                </p>
                {salesBlockedQty != null && salesBlockedQty > 0 ? (
                  <p className="text-slate-700">
                    Zablokowane sprzedażowo:{" "}
                    <span className="font-semibold tabular-nums text-amber-900">
                      {new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(salesBlockedQty)} szt.
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
            {networkCommerciallySellableQty != null ? (
              <div className="rounded-lg border border-cyan-200/80 bg-cyan-50/40 px-3 py-2 text-sm">
                <p className="text-slate-700">
                  Dostępne handlowo (sieć):{" "}
                  <span className="font-semibold tabular-nums text-cyan-900">
                    {new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(
                      networkCommerciallySellableQty,
                    )}{" "}
                    szt.
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Suma magazynów uwzględnianych w stanie sieciowym online.
                </p>
              </div>
            ) : null}
            {totalStockDisplay != null && allocatedStockDisplay != null && unallocatedStockDisplay != null ? (
              <div className="border-t border-slate-100 pt-3 space-y-1 text-xs text-slate-600">
                <p>
                  Na lokalizacjach:{" "}
                  <span className="font-semibold tabular-nums text-slate-800">{allocatedStockDisplay} szt.</span>
                </p>
                <p>
                  Nieprzypisane:{" "}
                  <span className="font-semibold tabular-nums text-slate-800">{unallocatedStockDisplay} szt.</span>
                </p>
              </div>
            ) : null}
          </div>
        ) : showBreakdown ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Stan całkowity:{" "}
              <span className="font-semibold text-slate-900 tabular-nums">{totalStockDisplay} szt.</span>
            </p>
            <p>
              Na lokalizacjach:{" "}
              <span className="font-semibold text-slate-900 tabular-nums">{allocatedStockDisplay} szt.</span>
            </p>
            <p>
              Nieprzypisane:{" "}
              <span className="font-semibold text-slate-900 tabular-nums">{unallocatedStockDisplay} szt.</span>
            </p>
            {reservedDisplay != null ? (
              <p>
                Zarezerwowano:{" "}
                <span className="font-semibold text-slate-900 tabular-nums">{reservedDisplay} szt.</span>
              </p>
            ) : null}
            {availableDisplay != null ? (
              <p>
                Dostępne:{" "}
                <span className="font-semibold text-slate-900 tabular-nums">{availableDisplay} szt.</span>
              </p>
            ) : null}
          </div>
        ) : showThree ? (
          <>
            <p className="text-sm text-slate-700">
              Stan:{" "}
              <span className="font-semibold text-slate-900">
                {physicalStockDisplay != null ? `${physicalStockDisplay} szt.` : "—"}
              </span>
            </p>
            <p className="text-sm text-slate-700">
              Zarezerwowano:{" "}
              <span className="font-semibold text-slate-900">
                {reservedDisplay != null ? `${reservedDisplay} szt.` : "—"}
              </span>
            </p>
            <p className="text-sm text-slate-700">
              Dostępne:{" "}
              <span className="font-semibold text-slate-900">
                {availableDisplay != null ? `${availableDisplay} szt.` : "—"}
              </span>
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-700">
            Stan fizyczny:{" "}
            <span className="font-semibold text-slate-900">
              {physicalStockDisplay != null ? `${physicalStockDisplay} szt.` : "—"}
            </span>
          </p>
        )}
        {showInventoryLink && canManualAdjustStock ? (
          <button
            type="button"
            onClick={onManualAdjustClick}
            className="mt-4 w-full inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Korekta stanu
          </button>
        ) : null}
        {showInventoryLink ? (
          <p className="text-xs text-slate-500">
            {canManualAdjustStock
              ? "Korekta tworzy dokument RK z pełnym audytem operacji."
              : "Stany aktualizuj wyłącznie dokumentami magazynowymi (tryb: tylko dokumenty)."}
          </p>
        ) : null}
        {editorSlot ? <div className="border-t border-slate-100 pt-3">{editorSlot}</div> : null}
      </WarehouseFormCard>

      <WarehouseFormCard title="Lokalizacje (inventory)">
        {inventoryRows.length === 0 ? (
          <p className="text-sm text-slate-600">{emptyLocationsMessage}</p>
        ) : (
          <ul className="space-y-2">
            {inventoryRows.map((row, idx) => (
              <li key={magazynInventoryRowReactKey(row, idx)} className="min-w-0">
                <MagazynInventoryLine
                  row={row}
                  onEditTraceability={onEditTraceability}
                  editDisabled={traceabilityEditDisabled}
                />
              </li>
            ))}
          </ul>
        )}
      </WarehouseFormCard>
    </div>
  );
}

export { fieldLabel as productWarehouseFieldLabel, inputClass as productWarehouseInputClass };
