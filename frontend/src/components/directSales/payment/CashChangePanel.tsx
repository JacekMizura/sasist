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
    <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100">
      
      {/* Wizualne równanie matematyczne (Do zapłaty - Wpłacono = Reszta) */}
      <div className="flex justify-between items-center mb-5">
        <div className="text-center">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Do zapłaty</div>
          <div className="text-xl font-black text-slate-900">{total.toFixed(2)}</div>
        </div>
        
        <div className="text-slate-300 font-light text-xl">-</div>
        
        <div className="text-center w-24">
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">Wpłacono</div>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            value={Number.isFinite(received) ? received : 0}
            onChange={(e) => onReceivedChange(Number(e.target.value) || 0)}
            className="w-full text-center text-xl font-black text-blue-700 bg-white border border-blue-200 rounded-xl py-1 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 transition-all shadow-sm"
          />
        </div>
        
        <div className="text-slate-300 font-light text-xl">=</div>
        
        <div className="text-center">
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1">Reszta</div>
          <div className="text-xl font-black text-emerald-600">{change.toFixed(2)}</div>
        </div>
      </div>

      {/* Szybkie nominały */}
      <div className="grid grid-cols-5 gap-2">
        {QUICK.map((inc) => (
          <button
            key={inc}
            type="button"
            disabled={disabled}
            onClick={() => onReceivedChange(Math.round((received + inc) * 100) / 100)}
            className="py-2.5 bg-white border border-blue-100 rounded-xl text-xs font-bold text-slate-700 hover:bg-blue-100 hover:text-blue-800 transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-700"
          >
            +{inc}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onReceivedChange(total)}
          className="py-2.5 bg-white border border-blue-100 rounded-xl text-xs font-bold text-slate-700 hover:bg-blue-100 hover:text-blue-800 transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-700"
        >
          Dokł.
        </button>
      </div>
      
    </div>
  );
}