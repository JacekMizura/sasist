import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MagazynInventoryLine, magazynInventoryRowReactKey, type MagazynInvRowDisplay } from "./MagazynInventoryLine";
import { WarehouseFormCard } from "./WarehouseFormCard";

const fieldLabel = "block text-sm font-medium text-slate-700 mb-1";
const inputClass = "w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-400";

export type ProductWarehouseStockPanelProps = {
  physicalStockDisplay: string | null;
  /** When set with `availableDisplay`, shows three-line summary (carton). Omit for classic product copy. */
  reservedDisplay?: string | null;
  availableDisplay?: string | null;
  inventoryRows: MagazynInvRowDisplay[];
  onEditTraceability?: (row: MagazynInvRowDisplay) => void;
  traceabilityEditDisabled?: boolean;
  showInventoryLink?: boolean;
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
  reservedDisplay,
  availableDisplay,
  inventoryRows,
  onEditTraceability,
  traceabilityEditDisabled = false,
  showInventoryLink = false,
  editorSlot,
  emptyLocationsMessage = "Brak stanu magazynowego",
}: ProductWarehouseStockPanelProps) {
  const showThree = reservedDisplay != null && availableDisplay != null;

  return (
    <div className="space-y-6">
      <WarehouseFormCard title="Stan magazynowy">
        {showThree ? (
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
        {showInventoryLink ? (
          <Link
            to="/inventory"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Zarządzaj stanem
          </Link>
        ) : null}
        {showInventoryLink ? (
          <p className="text-xs text-slate-500">Zmiany ilości wyłącznie przez operacje magazynowe.</p>
        ) : null}
        {editorSlot ? <div className="border-t border-slate-100 pt-3">{editorSlot}</div> : null}
      </WarehouseFormCard>

      <WarehouseFormCard title="Lokalizacje">
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
