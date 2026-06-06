import type { DirectSaleStockDelta } from "../../../types/directSalesCompletion";

type Props = {
  deltas: DirectSaleStockDelta[];
};

export function StockDeltaList({ deltas }: Props) {
  if (!deltas.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Zmiana stanu</h4>
      <ul className="space-y-1 text-xs text-slate-700">
        {deltas.map((d, i) => (
          <li key={`${d.location_code}-${i}`}>
            <span className="font-medium">{d.location_code}</span> ({d.product_name}):{" "}
            {d.stock_before != null && d.stock_after != null ? (
              <span>
                {d.stock_before} → {d.stock_after}
              </span>
            ) : (
              <span>wydano {d.qty_issued}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
