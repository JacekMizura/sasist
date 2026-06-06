import { Banknote, CreditCard } from "lucide-react";

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
    <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 flex flex-col gap-4">
      
      {/* Nagłówek */}
      <h3 className="text-[10px] font-bold text-blue-900/50 uppercase tracking-wider">
        Płatność mieszana
      </h3>

      {/* Pola wprowadzania */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Banknote size={14} className="text-blue-600" /> Gotówka
          </label>
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
            className="w-full text-center text-lg font-black text-slate-900 bg-white border-2 border-blue-100 rounded-xl py-2 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-50 transition-all shadow-sm"
          />
        </div>
        
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <CreditCard size={14} className="text-blue-600" /> Karta
          </label>
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
            className="w-full text-center text-lg font-black text-slate-900 bg-white border-2 border-blue-100 rounded-xl py-2 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-50 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Podsumowanie w formie pigułki */}
      <div className="grid grid-cols-3 bg-white rounded-xl py-2.5 border border-blue-50 shadow-sm divide-x divide-blue-50 mt-1 text-center items-center">
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Do zapłaty</div>
          <div className="font-black text-slate-800">{total.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-blue-500 uppercase tracking-wider mb-0.5">Wpłacono</div>
          <div className={`font-black transition-colors ${ok ? "text-emerald-500" : "text-amber-500"}`}>
            {sum.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pozostało</div>
          <div className="font-black text-slate-800">{remaining.toFixed(2)}</div>
        </div>
      </div>

    </div>
  );
}