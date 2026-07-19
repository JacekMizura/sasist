import { useEffect, useMemo, useState } from "react";
import {
  allocationUnresolved,
  unresolvedAllocations,
  type MultiBasketOrderAllocation,
} from "./multiBasketAllocation";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

type Props = {
  orders: MultiBasketOrderAllocation[];
  /** Pre-select a line (path A after partial put). */
  initialOrderItemId?: number | null;
  initialQty?: number | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (orderItemId: number, shortageQty: number) => void;
};

export function MultiAllocationShortageModal({
  orders,
  initialOrderItemId,
  initialQty,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const lines = useMemo(() => unresolvedAllocations(orders), [orders]);
  const [selectedId, setSelectedId] = useState<number>(() => {
    const want = initialOrderItemId != null ? Number(initialOrderItemId) : 0;
    if (want > 0 && lines.some((l) => Number(l.order_item_id) === want)) return want;
    return Number(lines[0]?.order_item_id ?? 0);
  });
  const selected = lines.find((l) => Number(l.order_item_id) === selectedId) ?? lines[0] ?? null;
  const maxQty = selected ? allocationUnresolved(selected) : 0;
  const [qty, setQty] = useState(() => {
    const init = initialQty != null && initialQty > 0 ? Math.floor(initialQty) : 0;
    return init > 0 ? init : Math.max(1, Math.floor(maxQty));
  });

  useEffect(() => {
    const want = initialOrderItemId != null ? Number(initialOrderItemId) : 0;
    if (want > 0 && lines.some((l) => Number(l.order_item_id) === want)) {
      setSelectedId(want);
    } else if (lines[0]?.order_item_id) {
      setSelectedId(Number(lines[0].order_item_id));
    }
  }, [initialOrderItemId, lines]);

  useEffect(() => {
    const rem = selected ? allocationUnresolved(selected) : 0;
    const prefer =
      initialOrderItemId != null &&
      Number(initialOrderItemId) === Number(selected?.order_item_id) &&
      initialQty != null &&
      initialQty > 0
        ? Math.floor(initialQty)
        : Math.floor(rem);
    setQty(Math.min(Math.max(1, prefer || 1), Math.max(1, Math.floor(rem))));
  }, [selected?.order_item_id, selected, initialOrderItemId, initialQty]);

  if (!lines.length) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4">
        <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
          <p className="text-sm font-semibold text-slate-700">Brak nierozliczonych alokacji dla tego SKU.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white"
          >
            Zamknij
          </button>
        </div>
      </div>
    );
  }

  const valid = selectedId > 0 && qty >= 1 && qty <= maxQty + 1e-9;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4">
      <div className="max-h-[min(92vh,720px)] w-full max-w-lg overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Zgłoś brak</h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl text-sm font-semibold text-slate-600 disabled:opacity-40"
          >
            Zamknij
          </button>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm text-slate-600">
            Brak jest rozliczany per koszyk / zamówienie. Wybierz alokację i ilość braku.
          </p>
          <ul className="space-y-2">
            {lines.map((o) => {
              const oiid = Number(o.order_item_id);
              const rem = allocationUnresolved(o);
              const active = oiid === selectedId;
              return (
                <li key={oiid}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setSelectedId(oiid)}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      active ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <p className="text-sm font-black text-slate-900">
                      {o.basket_slot?.trim() || "—"} / #{o.order_number}
                    </p>
                    <p className="text-xs font-semibold text-slate-600">Pozostało {fmtQty(rem)}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Ilość braku (max {fmtQty(maxQty)})</span>
            <input
              type="number"
              min={1}
              max={maxQty}
              step={1}
              disabled={busy}
              value={qty || ""}
              onChange={(e) => setQty(Number(e.target.value))}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-semibold outline-none"
            />
          </label>
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => onConfirm(selectedId, qty)}
            className="w-full rounded-xl bg-amber-600 py-4 text-sm font-bold uppercase tracking-wider text-white disabled:opacity-40"
          >
            {busy ? "Zapisywanie…" : `Zatwierdź brak ${fmtQty(qty)} szt.`}
          </button>
        </div>
      </div>
    </div>
  );
}
