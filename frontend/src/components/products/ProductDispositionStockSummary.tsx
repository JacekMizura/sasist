import type { ProductDispositionStock } from "../../types/productDispositionStock";
import { EMPTY_DISPOSITION_STOCK, fmtDispositionQty } from "../../types/productDispositionStock";

export type ProductDispositionStockSummaryProps = {
  disposition?: ProductDispositionStock | null;
  /** Active reservations — shows secondary line when > 0 */
  reservedQuantity?: number | null;
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

function ReservedSecondary({
  reserved,
  disposition,
}: {
  reserved: number;
  disposition: ProductDispositionStock;
}) {
  if (reserved <= 0) return null;
  return (
    <p className="text-xs text-slate-500 tabular-nums">
      Zarezerwowane: {fmtDispositionQty(reserved)} szt.
      {" · "}
      Po rezerwacji: {fmtDispositionQty(disposition.saleable_available_qty)} szt.
    </p>
  );
}

export function ProductDispositionStockSummary({
  disposition,
  reservedQuantity,
  variant,
  className = "",
}: ProductDispositionStockSummaryProps) {
  const d = disposition ?? EMPTY_DISPOSITION_STOCK;
  const reserved = reservedQuantity != null && Number.isFinite(reservedQuantity) ? reservedQuantity : 0;
  const physical =
    d.physical_qty > 0 ? d.physical_qty : disposition == null ? undefined : d.physical_qty;
  const saleable = d.saleable_qty;

  if (variant === "list") {
    return (
      <div className={`text-right text-sm tabular-nums ${className}`}>
        <p className="text-slate-800">
          <span className="text-slate-500">Dostępne:</span>{" "}
          <span className={saleable === 0 ? "font-semibold text-red-600" : "font-medium text-slate-900"}>
            {fmtDispositionQty(saleable)}
          </span>
        </p>
        <p className="text-slate-600">
          <span className="text-slate-500">Fizycznie:</span> {fmtDispositionQty(physical ?? saleable)}
        </p>
        {reserved > 0 ? (
          <p className="text-xs text-slate-500">Po rezerwacji: {fmtDispositionQty(d.saleable_available_qty)}</p>
        ) : null}
      </div>
    );
  }

  if (variant === "wms") {
    const pools = poolLines(d);
    return (
      <div className={`space-y-1 ${className}`}>
        <p className="text-center text-2xl font-black tabular-nums text-indigo-950 sm:text-3xl">
          {fmtDispositionQty(saleable)}{" "}
          <span className="text-base font-bold text-indigo-800/90">dostępne (A)</span>
        </p>
        <p className="text-center text-sm font-medium tabular-nums text-indigo-900/80">
          Fizycznie: {fmtDispositionQty(physical ?? d.physical_qty)} szt.
        </p>
        {pools.length > 0 ? (
          <p className="text-center text-xs text-indigo-900/70">
            {pools.map((p) => `${p.label}: ${fmtDispositionQty(p.qty)}`).join(" · ")}
          </p>
        ) : null}
        {reserved > 0 ? (
          <p className="text-center text-xs text-indigo-800/60">
            Po rezerwacji: {fmtDispositionQty(d.saleable_available_qty)} szt.
          </p>
        ) : null}
      </div>
    );
  }

  // panel
  const pools = poolLines(d);
  return (
    <div className={`space-y-2 text-sm text-slate-700 ${className}`}>
      <p>
        Dostępne:{" "}
        <span className="font-semibold text-slate-900 tabular-nums">{fmtDispositionQty(saleable)} szt.</span>
      </p>
      {pools.map((p) => (
        <p key={p.label}>
          {p.label}:{" "}
          <span className="font-semibold text-slate-900 tabular-nums">{fmtDispositionQty(p.qty)} szt.</span>
        </p>
      ))}
      <p>
        Fizycznie:{" "}
        <span className="font-semibold text-slate-900 tabular-nums">
          {fmtDispositionQty(physical ?? d.physical_qty)} szt.
        </span>
      </p>
      <ReservedSecondary reserved={reserved} disposition={d} />
    </div>
  );
}
