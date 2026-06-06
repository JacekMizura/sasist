type Props = {
  total: number;
  received: number;
  onReceivedChange: (value: number) => void;
  disabled?: boolean;
};

const QUICK = [10, 20, 50, 100];

export function CashChangePanel({ total, received, onReceivedChange, disabled }: Props) {
  const change = Math.max(0, received - total);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className="text-slate-500">Do zapłaty</div>
          <div className="text-lg font-bold text-slate-900">{total.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-500">Wpłacono</div>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            value={Number.isFinite(received) ? received : 0}
            onChange={(e) => onReceivedChange(Number(e.target.value) || 0)}
            className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-center text-lg font-bold text-slate-900 disabled:opacity-50"
          />
        </div>
        <div>
          <div className="text-slate-500">Reszta</div>
          <div className="text-lg font-bold text-emerald-800">{change.toFixed(2)}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {QUICK.map((inc) => (
          <button
            key={inc}
            type="button"
            disabled={disabled}
            onClick={() => onReceivedChange(Math.round((received + inc) * 100) / 100)}
            className="rounded border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-900 disabled:opacity-50"
          >
            +{inc}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onReceivedChange(total)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 disabled:opacity-50"
        >
          Dokładnie
        </button>
      </div>
    </div>
  );
}
