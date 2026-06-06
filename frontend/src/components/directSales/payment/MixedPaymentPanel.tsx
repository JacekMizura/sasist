type Props = {
  total: number;
  cashAmount: number;
  cardAmount: number;
  onCashChange: (value: number) => void;
  onCardChange: (value: number) => void;
  disabled?: boolean;
};

export function MixedPaymentPanel({
  total,
  cashAmount,
  cardAmount,
  onCashChange,
  onCardChange,
  disabled,
}: Props) {
  const sum = Math.round((cashAmount + cardAmount) * 100) / 100;
  const remaining = Math.max(0, total - sum);
  const ok = Math.abs(sum - total) <= 0.02;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Płatność mieszana</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">
          Gotówka
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            value={cashAmount}
            onChange={(e) => {
              const cash = Number(e.target.value) || 0;
              onCashChange(cash);
              onCardChange(Math.max(0, Math.round((total - cash) * 100) / 100));
            }}
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </label>
        <label className="text-xs text-slate-600">
          Karta
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            value={cardAmount}
            onChange={(e) => {
              const card = Number(e.target.value) || 0;
              onCardChange(card);
              onCashChange(Math.max(0, Math.round((total - card) * 100) / 100));
            }}
            className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
        <div>
          <div className="text-slate-500">Do zapłaty</div>
          <div className="font-bold text-slate-900">{total.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-500">Wpłacono</div>
          <div className={`font-bold ${ok ? "text-emerald-800" : "text-amber-800"}`}>{sum.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-500">Pozostało</div>
          <div className="font-bold text-slate-900">{remaining.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
