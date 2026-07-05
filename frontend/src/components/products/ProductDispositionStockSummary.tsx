import type { ProductDispositionStock } from "../../types/productDispositionStock";
import { EMPTY_DISPOSITION_STOCK, fmtDispositionQty } from "../../types/productDispositionStock";

export type ProductDispositionStockSummaryProps = {
  disposition?: ProductDispositionStock | null;
  /** Active reservations — shows secondary line when > 0 */
  reservedQuantity?: number | null;
  /** Production batch/order reservations — separate line when > 0 */
  productionReservedQuantity?: number | null;
  /**
   * list: Dostępne + Fizycznie (product list column)
   * panel: full breakdown for product card / warehouse tab
   * wms: compact header for WMS product preview
   */
  variant: "list" | "panel" | "wms";
  className?: string;
};

function poolLines(d: ProductDispositionStock): { label: string; qty: number }[] {
  const lines: { label: string; qty: number }[] = [];
  if (d.outlet_qty > 0) lines.push({ label: "Outlet", qty: d.outlet_qty });
  if (d.service_qty > 0) lines.push({ label: "Serwis", qty: d.service_qty });
  if (d.quarantine_qty > 0) lines.push({ label: "Kwarantanna", qty: d.quarantine_qty });
  if (d.scrap_qty > 0) lines.push({ label: "Złom", qty: d.scrap_qty });
  if (d.rejected_qty > 0) lines.push({ label: "Odrzucone", qty: d.rejected_qty });
  if (d.other_qty > 0) lines.push({ label: "Inne", qty: d.other_qty });
  return lines;
}

function dockQty(d: ProductDispositionStock): number {
  const v = d.dock_qty;
  return v != null && Number.isFinite(v) ? v : 0;
}

function ReservedSecondary({
  reserved,
  productionReserved,
  disposition,
}: {
  reserved: number;
  productionReserved: number;
  disposition: ProductDispositionStock;
}) {
  if (reserved <= 0 && productionReserved <= 0) return null;
  return (
    <div className="space-y-1 text-xs text-slate-500 tabular-nums">
      {reserved > 0 ? (
        <p>
          Zarezerwowane: {fmtDispositionQty(reserved)} szt.
          {" · "}
          Po rezerwacji: {fmtDispositionQty(disposition.saleable_available_qty)} szt.
        </p>
      ) : null}
      {productionReserved > 0 ? (
        <p>Zarezerwowane do produkcji: {fmtDispositionQty(productionReserved)} szt.</p>
      ) : null}
    </div>
  );
}

export function ProductDispositionStockSummary({
  disposition,
  reservedQuantity,
  productionReservedQuantity,
  variant,
  className = "",
}: ProductDispositionStockSummaryProps) {
  const d = disposition ?? EMPTY_DISPOSITION_STOCK;
  const reserved = reservedQuantity != null && Number.isFinite(reservedQuantity) ? reservedQuantity : 0;
  const productionReserved =
    productionReservedQuantity != null && Number.isFinite(productionReservedQuantity)
      ? productionReservedQuantity
      : 0;
  const available = d.saleable_available_qty;
  const physical = d.physical_qty;
  const dock = dockQty(d);
  const pools = poolLines(d);

  if (variant === "list") {
    return (
      <div className={`text-right text-sm tabular-nums ${className}`}>
        <p className="text-slate-800">
          <span className="text-slate-500">Dostępny:</span>{" "}
          <span className={available === 0 ? "font-semibold text-red-600" : "font-medium text-slate-900"}>
            {fmtDispositionQty(available)}
          </span>
        </p>
        <p className="text-slate-600">
          <span className="text-slate-500">Fizycznie:</span> {fmtDispositionQty(physical)}
        </p>
        {dock > 0 ? (
          <p className="text-xs text-amber-800">
            Na DOCK: {fmtDispositionQty(dock)}
          </p>
        ) : null}
        {reserved > 0 ? (
          <p className="text-xs text-slate-500">Po rezerwacji: {fmtDispositionQty(available)}</p>
        ) : null}
      </div>
    );
  }

  if (variant === "wms") {
    return (
      <div className={`space-y-1 ${className}`}>
        <p className="text-center text-2xl font-black tabular-nums text-indigo-950 sm:text-3xl">
          {fmtDispositionQty(available)}{" "}
          <span className="text-base font-bold text-indigo-800/90">dostępny</span>
        </p>
        <p className="text-center text-sm font-medium tabular-nums text-indigo-900/80">
          Fizycznie: {fmtDispositionQty(physical)} szt.
        </p>
        {dock > 0 ? (
          <p className="text-center text-sm font-semibold tabular-nums text-amber-900">
            Na DOCK: {fmtDispositionQty(dock)} szt. · wymaga rozlokowania
          </p>
        ) : null}
        {pools.length > 0 ? (
          <p className="text-center text-xs text-indigo-900/70">
            {pools.map((p) => `${p.label}: ${fmtDispositionQty(p.qty)}`).join(" · ")}
          </p>
        ) : null}
        {reserved > 0 ? (
          <p className="text-center text-xs text-indigo-800/60">
            Po rezerwacji: {fmtDispositionQty(available)} szt.
          </p>
        ) : null}
      </div>
    );
  }

  // panel
  return (
    <div className={`space-y-2 text-sm text-slate-700 ${className}`}>
      <p>
        Stan fizyczny:{" "}
        <span className="font-semibold text-slate-900 tabular-nums">{fmtDispositionQty(physical)} szt.</span>
      </p>
      <p>
        Dostępny:{" "}
        <span className="font-semibold text-emerald-800 tabular-nums">{fmtDispositionQty(available)} szt.</span>
      </p>
      {dock > 0 ? (
        <p>
          Na DOCK:{" "}
          <span className="font-semibold text-amber-900 tabular-nums">{fmtDispositionQty(dock)} szt.</span>
          <span className="ml-1 text-xs text-amber-800/90">(wymaga rozlokowania)</span>
        </p>
      ) : null}
      {pools.map((p) => (
        <p key={p.label}>
          {p.label}:{" "}
          <span className="font-semibold text-slate-900 tabular-nums">{fmtDispositionQty(p.qty)} szt.</span>
        </p>
      ))}
      <ReservedSecondary
        reserved={reserved}
        productionReserved={productionReserved}
        disposition={d}
      />
    </div>
  );
}
