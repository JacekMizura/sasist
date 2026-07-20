import { useEffect, useMemo, useState } from "react";
import {
  allocationLineStatus,
  allocationStatusLabel,
  allocationUnresolved,
  aggregateAllocations,
  unresolvedAllocations,
  type MultiBasketOrderAllocation,
} from "./multiBasketAllocation";
import type { WmsPickingDraftPickApi } from "../../../api/wmsPickingProductsApi";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

type Props = {
  orders: MultiBasketOrderAllocation[];
  draftPicks: WmsPickingDraftPickApi[];
  highlightPickId?: number | null;
  picksLoading?: boolean;
  undoBusyPickId?: number | null;
  onOpenBulkShortage: () => void;
  onReportLineShortage: (orderItemId: number, maxQty: number) => void;
  onUndoPick: (pickId: number) => void;
  shortageBusy?: boolean;
};

export function MultiBasketAllocationPanel({
  orders,
  draftPicks,
  highlightPickId,
  picksLoading,
  undoBusyPickId,
  onOpenBulkShortage,
  onReportLineShortage,
  onUndoPick,
  shortageBusy,
}: Props) {
  const totals = aggregateAllocations(orders);
  const unresolved = unresolvedAllocations(orders);
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (highlightPickId == null) return;
    const hit = draftPicks.find((p) => p.pick_id === highlightPickId);
    if (!hit) return;
    const key = String(hit.order_item_id ?? hit.order_id);
    setOpenHistory((prev) => ({ ...prev, [key]: true }));
  }, [highlightPickId, draftPicks]);

  const picksByOrderItem = useMemo(() => {
    const map = new Map<string, WmsPickingDraftPickApi[]>();
    for (const p of draftPicks) {
      const key = String(p.order_item_id ?? `o-${p.order_id}`);
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return map;
  }, [draftPicks]);

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
          Rozliczenie per koszyk
        </h4>
        <ul className="space-y-2">
          {orders.map((o) => {
            const status = allocationLineStatus(o);
            const lineUnresolved = allocationUnresolved(o);
            const oiid = o.order_item_id != null ? Number(o.order_item_id) : 0;
            const histKey = String(oiid || `o-${o.order_id}`);
            const linePicks = picksByOrderItem.get(String(oiid)) ?? picksByOrderItem.get(`o-${o.order_id}`) ?? [];
            const historyOpen = Boolean(openHistory[histKey]);
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
                    <p className="mt-1 text-xs font-semibold text-slate-600 tabular-nums">
                      Potrzeba {fmtQty(o.quantity)} · Zebrano {fmtQty(o.picked_quantity)} · Brak{" "}
                      {fmtQty(o.missing_quantity)} · Nierozliczone {fmtQty(lineUnresolved)}
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
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenHistory((prev) => ({ ...prev, [histKey]: !historyOpen }))}
                    className="text-[11px] font-semibold uppercase tracking-wider text-indigo-800 underline decoration-indigo-200 underline-offset-2"
                  >
                    {historyOpen ? "Ukryj historię pobrań" : `Historia pobrań (${linePicks.length})`}
                  </button>
                  {lineUnresolved > 1e-9 && oiid > 0 ? (
                    <button
                      type="button"
                      disabled={shortageBusy}
                      onClick={() => onReportLineShortage(oiid, lineUnresolved)}
                      className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-950 disabled:opacity-40"
                    >
                      Zgłoś brak tylko dla tego koszyka ({fmtQty(lineUnresolved)} szt.)
                    </button>
                  ) : null}
                </div>
                {historyOpen ? (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                    {picksLoading ? (
                      <p className="text-xs font-semibold text-slate-500">Ładowanie pobrań…</p>
                    ) : linePicks.length === 0 ? (
                      <p className="text-xs font-semibold text-slate-500">Brak draft pobrań dla tego koszyka.</p>
                    ) : (
                      <ul className="space-y-2">
                        {linePicks.map((p) => {
                          const hi = highlightPickId != null && p.pick_id === highlightPickId;
                          return (
                            <li
                              key={p.pick_id}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                                hi
                                  ? "border-rose-400 bg-rose-50 ring-2 ring-rose-100"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <div>
                                <p className="font-mono text-sm font-bold text-slate-900">
                                  {p.location_code}{" "}
                                  <span className="tabular-nums text-indigo-900">{fmtQty(p.quantity)} szt.</span>
                                </p>
                                <p className="text-[10px] font-semibold text-slate-500">
                                  Pick #{p.pick_id}
                                  {p.created_at ? ` · ${p.created_at}` : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={undoBusyPickId != null}
                                onClick={() => onUndoPick(p.pick_id)}
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                              >
                                {undoBusyPickId === p.pick_id ? "Cofanie…" : "Cofnij to pobranie"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
