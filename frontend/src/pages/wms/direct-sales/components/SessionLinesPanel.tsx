import { useEffect, useState } from "react";

import type { DirectSaleSession } from "../services/directSalesApi";
import type { LocationStockSnapshot } from "../services/locationStockApi";
import { lineTotal } from "../utils/lineTotal";

type Props = {
  session: DirectSaleSession | null;
  stockSnap: LocationStockSnapshot | null;
  lastProductId: number | null;
};

export function SessionLinesPanel({ session, stockSnap, lastProductId }: Props) {
  const [stockPulse, setStockPulse] = useState(false);

  useEffect(() => {
    if (!stockSnap?.revision) return;
    setStockPulse(true);
    const t = window.setTimeout(() => setStockPulse(false), 600);
    return () => window.clearTimeout(t);
  }, [stockSnap?.revision]);

  return (
    <main className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Pozycje sesji</h2>
        {session?.reservation_scope ? (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
            Rezerwacja: {session.reservation_scope}
          </span>
        ) : null}
        {session?.status === "CHECKOUT" ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
            Płatność
          </span>
        ) : null}
      </div>
      {session?.lines.length ? (
        <ul className="divide-y divide-slate-100">
          {session.lines.map((ln) => (
            <li key={ln.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                Produkt #{ln.product_id} × {ln.quantity}
                {ln.source_location_id ? (
                  <span className="ml-2 text-xs text-slate-500">lok. #{ln.source_location_id}</span>
                ) : null}
              </span>
              <span className="font-medium">{lineTotal(ln).toFixed(2)} zł</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Zeskanuj pierwszy produkt.</p>
      )}

      {lastProductId != null && stockSnap ? (
        <div
          className={`mt-4 rounded-lg border border-slate-100 bg-slate-50 p-2 transition-colors duration-500 ${
            stockPulse ? "bg-sky-50 ring-1 ring-sky-200" : ""
          }`}
        >
          <div className="text-xs text-slate-500">Stan lokacji (rev {stockSnap.revision ?? "—"})</div>
          <ul className="mt-1 space-y-1 text-xs">
            {stockSnap.locations.slice(0, 6).map((loc) => (
              <li key={loc.location_id} className="flex justify-between">
                <span>{loc.code}</span>
                <span>dostępne: {loc.available}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
