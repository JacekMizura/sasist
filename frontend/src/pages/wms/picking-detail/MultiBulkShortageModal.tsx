/**
 * Bulk shortage modal for MULTI — many allocations, same SSOT as single shortage.
 * Select-all fills shortage_qty = unresolved; operator can partial / skip lines.
 */
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  allocationUnresolved,
  unresolvedAllocations,
  type MultiBasketOrderAllocation,
} from "./multiBasketAllocation";

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

export type BulkShortageItemPayload = {
  order_item_id: number;
  missing_qty: number;
};

type RowState = {
  orderItemId: number;
  selected: boolean;
  shortageQty: number;
  maxUnresolved: number;
};

type Props = {
  orders: MultiBasketOrderAllocation[];
  productName: string;
  productEan: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (items: BulkShortageItemPayload[]) => void;
};

export function MultiBulkShortageModal({
  orders,
  productName,
  productEan,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const lines = useMemo(() => unresolvedAllocations(orders), [orders]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [confirmBig, setConfirmBig] = useState(false);

  useEffect(() => {
    setRows(
      lines.map((o) => {
        const rem = Math.max(0, Math.floor(allocationUnresolved(o)));
        return {
          orderItemId: Number(o.order_item_id),
          selected: false,
          shortageQty: rem > 0 ? rem : 1,
          maxUnresolved: rem,
        };
      }),
    );
    setConfirmBig(false);
  }, [lines]);

  const totalUnresolved = useMemo(
    () => lines.reduce((s, o) => s + allocationUnresolved(o), 0),
    [lines],
  );

  const selectedRows = rows.filter((r) => r.selected && r.shortageQty > 0);
  const selectedBaskets = selectedRows.length;
  const reportingQty = selectedRows.reduce((s, r) => s + Math.min(r.shortageQty, r.maxUnresolved), 0);
  const remainingAfter = Math.max(0, totalUnresolved - reportingQty);

  const selectAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.maxUnresolved > 0,
        shortageQty: Math.max(1, r.maxUnresolved),
      })),
    );
  };

  const clearSelection = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  const patchRow = (orderItemId: number, patch: Partial<RowState>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.orderItemId !== orderItemId) return r;
        const next = { ...r, ...patch };
        next.shortageQty = Math.min(
          Math.max(1, Math.floor(next.shortageQty || 1)),
          Math.max(1, next.maxUnresolved),
        );
        return next;
      }),
    );
  };

  const submit = () => {
    const items = selectedRows.map((r) => ({
      order_item_id: r.orderItemId,
      missing_qty: Math.min(r.shortageQty, r.maxUnresolved),
    }));
    if (!items.length) return;
    if (items.length >= 2 && !confirmBig) {
      setConfirmBig(true);
      return;
    }
    onConfirm(items);
  };

  if (!lines.length) {
    return (
      <div className="fixed inset-0 z-[1700] flex items-end sm:items-center justify-center bg-slate-950/55 p-0 sm:p-4">
        <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
          <p className="text-sm font-semibold text-slate-700">Brak nierozliczonych alokacji.</p>
          <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white">
            Zamknij
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1700] flex items-end sm:items-center justify-center bg-slate-950/55 p-0 sm:p-3">
      <div className="flex max-h-[min(94vh,820px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Rozlicz braki</p>
              <p className="mt-1 text-base font-bold text-slate-900 leading-snug">{productName}</p>
              <p className="font-mono text-sm font-semibold text-slate-500">EAN: {productEan?.trim() || "—"}</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Nierozliczone łącznie: <span className="font-black tabular-nums">{fmtQty(totalUnresolved)}</span> szt. ·{" "}
                {lines.length} koszyk{lines.length === 1 ? "" : "ów"}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Zamknij"
            >
              <X size={20} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={selectAll}
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-950 disabled:opacity-40"
            >
              Zaznacz wszystkie nierozliczone
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={clearSelection}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-700 disabled:opacity-40"
            >
              Wyczyść zaznaczenie
            </button>
          </div>
        </div>

        <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {lines.map((o) => {
            const oiid = Number(o.order_item_id);
            const row = rows.find((r) => r.orderItemId === oiid);
            if (!row) return null;
            const rem = allocationUnresolved(o);
            return (
              <li
                key={oiid}
                className={`rounded-xl border px-3 py-3 ${
                  row.selected ? "border-amber-400 bg-amber-50/80" : "border-slate-200 bg-white"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={row.selected}
                    onChange={(e) => patchRow(oiid, { selected: e.target.checked })}
                    className="mt-1 h-5 w-5 accent-amber-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900">
                      <span className="tabular-nums text-[#5a4fcf]">{o.basket_slot?.trim() || "—"}</span>
                      <span className="mx-2 text-slate-300">|</span>#{o.order_number}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      Wymagane {fmtQty(o.quantity)} · Zebrano {fmtQty(o.picked_quantity)} · Pozostało{" "}
                      {fmtQty(rem)}
                    </p>
                  </div>
                </label>
                {row.selected ? (
                  <div className="mt-3 flex items-center justify-between gap-2 pl-8">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">Brak</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || row.shortageQty <= 1}
                        onClick={() => patchRow(oiid, { shortageQty: row.shortageQty - 1 })}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white disabled:opacity-40"
                      >
                        <Minus size={18} strokeWidth={2.5} />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={busy}
                        value={row.shortageQty || ""}
                        onChange={(e) => {
                          const n = Number(String(e.target.value).replace(/[^\d]/g, ""));
                          patchRow(oiid, { shortageQty: Number.isFinite(n) ? n : 1 });
                        }}
                        className="w-16 rounded-xl border border-slate-200 bg-white py-2 text-center text-lg font-black tabular-nums outline-none"
                      />
                      <button
                        type="button"
                        disabled={busy || row.shortageQty >= row.maxUnresolved}
                        onClick={() => patchRow(oiid, { shortageQty: row.shortageQty + 1 })}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white disabled:opacity-40"
                      >
                        <Plus size={18} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="sticky bottom-0 z-10 space-y-3 border-t border-slate-100 bg-white px-4 py-3">
          <dl className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
              <dt className="font-bold uppercase tracking-wider text-slate-500">Wybrane</dt>
              <dd className="mt-0.5 text-lg font-black tabular-nums text-slate-900">{selectedBaskets}</dd>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-2 py-2">
              <dt className="font-bold uppercase tracking-wider text-amber-800">Zgłaszany brak</dt>
              <dd className="mt-0.5 text-lg font-black tabular-nums text-amber-950">{fmtQty(reportingQty)}</dd>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-2 py-2">
              <dt className="font-bold uppercase tracking-wider text-indigo-700">Zostanie</dt>
              <dd className="mt-0.5 text-lg font-black tabular-nums text-indigo-950">{fmtQty(remainingAfter)}</dd>
            </div>
          </dl>
          {confirmBig ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-950">
              Zgłosić {fmtQty(reportingQty)} szt. braków w {selectedBaskets} zamówieniach? To zmieni realizację tych
              zamówień.
            </div>
          ) : null}
          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirmBig) setConfirmBig(false);
                else onClose();
              }}
              className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-black uppercase tracking-wide text-slate-700 disabled:opacity-40"
            >
              {confirmBig ? "Wróć" : "Anuluj"}
            </button>
            <button
              type="button"
              disabled={busy || selectedBaskets < 1 || reportingQty <= 0}
              onClick={submit}
              className="flex-[1.4] rounded-2xl bg-amber-600 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-md disabled:opacity-40"
            >
              {busy ? "Zapisywanie…" : confirmBig ? "Tak, zgłoś braki" : "Zatwierdź braki"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
