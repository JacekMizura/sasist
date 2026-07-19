import {
  allocationLineStatus,
  allocationStatusLabel,
  allocationUnresolved,
  aggregateAllocations,
  unresolvedAllocations,
  type MultiBasketOrderAllocation,
} from "./multiBasketAllocation";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

type Props = {
  orders: MultiBasketOrderAllocation[];
  onOpenBulkShortage: () => void;
  onReportLineShortage: (orderItemId: number, maxQty: number) => void;
  shortageBusy?: boolean;
};

export function MultiBasketAllocationPanel({
  orders,
  onOpenBulkShortage,
  onReportLineShortage,
  shortageBusy,
}: Props) {
  const totals = aggregateAllocations(orders);
  const unresolved = unresolvedAllocations(orders);
  if (!orders.length) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            ["Potrzeba", totals.required, "text-slate-900"],
            ["Zebrano", totals.picked, "text-emerald-800"],
            ["Braki", totals.shortage, "text-amber-900"],
            ["Nierozliczone", totals.unresolved, "text-indigo-900"],
          ] as const
        ).map(([label, val, cls]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-black tabular-nums ${cls}`}>{fmtQty(val)}</p>
          </div>
        ))}
      </div>

      {unresolved.length > 0 ? (
        <button
          type="button"
          disabled={shortageBusy}
          onClick={onOpenBulkShortage}
          className="w-full rounded-2xl border-2 border-amber-400 bg-amber-500 px-4 py-4 text-left text-white shadow-md hover:bg-amber-600 disabled:opacity-40"
        >
          <p className="text-sm font-black uppercase tracking-widest">Rozlicz braki</p>
          <p className="mt-1 text-xs font-semibold text-amber-50">
            {unresolved.length} koszyk{unresolved.length === 1 ? "" : "ów"} · {fmtQty(totals.unresolved)} szt.
            nierozliczonych
          </p>
        </button>
      ) : null}

      <div>
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
          Koszyki / zamówienia
        </h4>
        <ul className="space-y-2">
          {orders.map((o) => {
            const status = allocationLineStatus(o);
            const lineUnresolved = allocationUnresolved(o);
            const oiid = o.order_item_id != null ? Number(o.order_item_id) : 0;
            return (
              <li
                key={oiid || `${o.order_id}-${o.basket_slot ?? ""}`}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">
                      <span className="tabular-nums text-[#5a4fcf]">{o.basket_slot?.trim() || "—"}</span>
                      <span className="mx-2 text-slate-300">|</span>
                      <span>#{o.order_number}</span>
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      Wymagane {fmtQty(o.quantity)} · Zebrano {fmtQty(o.picked_quantity)} · Brak{" "}
                      {fmtQty(o.missing_quantity)}
                      {lineUnresolved > 1e-9 ? ` · Nierozliczone ${fmtQty(lineUnresolved)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                      status === "READY"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : status === "FULL_SHORTAGE" || status === "PARTIAL_SHORTAGE"
                          ? "bg-amber-50 text-amber-900 border border-amber-200"
                          : "bg-indigo-50 text-indigo-900 border border-indigo-200"
                    }`}
                  >
                    {allocationStatusLabel(status)}
                  </span>
                </div>
                {lineUnresolved > 1e-9 && oiid > 0 ? (
                  <button
                    type="button"
                    disabled={shortageBusy}
                    onClick={() => onReportLineShortage(oiid, lineUnresolved)}
                    className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-950 disabled:opacity-40"
                  >
                    Zgłoś brak tylko dla tego koszyka ({fmtQty(lineUnresolved)} szt.)
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
