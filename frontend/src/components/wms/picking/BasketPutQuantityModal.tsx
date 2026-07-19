/**
 * Quantity confirm modal for MULTI basket put (receiving-style − / input / +).
 * Pick is committed only on explicit confirm — never on basket scan alone.
 */
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type BasketPutQuantityDraft = {
  basketScan: string;
  basketLabel: string;
  orderId: number;
  orderItemId: number;
  orderNumber?: string | null;
  lineRemaining: number;
  productName: string;
  productEan: string | null;
  productImageUrl?: string | null;
};

type Props = {
  draft: BasketPutQuantityDraft;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (quantity: number) => void;
};

function parseQty(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function BasketPutQuantityModal({ draft, busy, onCancel, onConfirm }: Props) {
  const maxQty = Math.max(0, Math.floor(draft.lineRemaining));
  const [inputVal, setInputVal] = useState(String(maxQty > 0 ? maxQty : 1));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setInputVal(String(Math.max(1, maxQty > 0 ? maxQty : 1)));
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(t);
  }, [draft.basketLabel, draft.orderItemId, maxQty]);

  const qty = parseQty(inputVal);
  const valid = qty >= 1 && qty <= maxQty + 1e-9;

  const bump = (delta: number) => {
    setInputVal((prev) => {
      const cur = Math.floor(parseQty(prev));
      const next = Math.min(maxQty, Math.max(1, cur + delta));
      return String(next);
    });
  };

  return (
    <div className="fixed inset-0 z-[1700] flex items-end sm:items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="basket-put-qty-title"
        className="w-full max-w-[560px] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p id="basket-put-qty-title" className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700">
              Odłóż produkt
            </p>
            <p className="mt-1 text-base font-bold text-slate-900 leading-snug">{draft.productName}</p>
            <p className="mt-0.5 font-mono text-sm font-semibold text-slate-500">
              EAN: {draft.productEan?.trim() || "—"}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Anuluj"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Koszyk</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-indigo-950">{draft.basketLabel}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Zamówienie</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {draft.orderNumber?.trim() || `#${draft.orderId}`}
              </p>
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-600">
            Do odłożenia maksymalnie:{" "}
            <span className="font-black tabular-nums text-slate-900">{maxQty}</span> szt.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-2">
          <button
            type="button"
            disabled={busy || qty <= 1}
            onClick={() => bump(-1)}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.25rem] border border-slate-200 bg-white shadow-sm active:scale-95 disabled:opacity-40"
          >
            <Minus className="h-8 w-8" strokeWidth={2.5} />
          </button>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            disabled={busy}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value.replace(/[^\d.,]/g, ""))}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid && !busy) {
                e.preventDefault();
                onConfirm(Math.floor(qty));
              }
            }}
            className="w-full max-w-[160px] bg-transparent p-0 text-center text-[4.5rem] font-medium leading-none tracking-tighter text-[#5a4fcf] outline-none tabular-nums"
          />
          <button
            type="button"
            disabled={busy || qty >= maxQty}
            onClick={() => bump(1)}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.25rem] border border-slate-200 bg-white shadow-sm active:scale-95 disabled:opacity-40"
          >
            <Plus className="h-8 w-8" strokeWidth={2.5} />
          </button>
        </div>
        {!valid ? (
          <p className="px-5 pb-2 text-center text-xs font-bold text-rose-600">
            Podaj ilość od 1 do {maxQty}.
          </p>
        ) : null}

        <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => onConfirm(Math.floor(qty))}
            className="flex-[1.4] rounded-2xl bg-indigo-600 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-md hover:bg-indigo-700 disabled:opacity-40"
          >
            {busy ? "Zapis…" : `Odłóż ${Math.floor(qty)} szt.`}
          </button>
        </div>
      </div>
    </div>
  );
}
