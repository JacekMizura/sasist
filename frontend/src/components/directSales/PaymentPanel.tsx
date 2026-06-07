import { Banknote, CreditCard, Smartphone, Wallet, CheckCircle } from "lucide-react";
import type { DirectSaleSession } from "../../utils/normalizeDirectSales";
import { formatMoneyPl, paymentMethodPl, sessionStatusPl } from "./directSalesTerminology";

const METHODS = [
  { id: "CASH", label: "Gotówka", key: "F1", Icon: Banknote },
  { id: "CARD", label: "Karta", key: "F2", Icon: CreditCard },
  { id: "BLIK", label: "BLIK", key: "F3", Icon: Smartphone },
  { id: "MIXED", label: "Mieszana", key: "", Icon: Wallet },
] as const;

type Props = {
  total: number;
  busy: boolean;
  hasSession: boolean;
  hasLines: boolean;
  session: DirectSaleSession | null;
  paymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  onComplete: () => void;
};

function numFromCtx(ctx: Record<string, unknown> | null, key: string): number | null {
  if (!ctx) return null;
  const v = ctx[key];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function PaymentPanel({
  total,
  busy,
  hasSession,
  hasLines,
  session,
  paymentMethod,
  onPaymentMethodChange,
  onComplete,
}: Props) {
  const payCtx = session?.payment_context;
  const amount = numFromCtx(payCtx, "amount") ?? total;
  const paid = numFromCtx(payCtx, "paid_amount") ?? (session?.status === "CHECKOUT" ? 0 : null);
  const remaining = paid != null ? Math.max(0, amount - paid) : amount;

  return (
    <div className="flex flex-col gap-6 w-full">
      
      {/* TOTAL DO ZAPŁATY - Główny punkt skupienia */}
      <div className="bg-blue-600 text-white rounded-[2rem] p-6 lg:p-8 shadow-xl shadow-blue-600/20 relative overflow-hidden">
        {/* Ozdobny gradient w tle */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-[80px] opacity-10 -mr-20 -mt-20"></div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-2">
            <div className="text-blue-100 text-sm font-semibold tracking-wide uppercase">Do zapłaty</div>
            {session?.status ? (
              <span className="bg-blue-500/40 text-white text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wide">
                {sessionStatusPl(session.status)}
              </span>
            ) : null}
          </div>
          
          <div className="text-5xl font-black tracking-tight mb-2">
            {formatMoneyPl(amount)}
          </div>

          {/* Dodatkowe informacje w stanie CHECKOUT */}
          {session?.status === "CHECKOUT" && (
            <div className="mt-6 pt-4 border-t border-blue-500/50 flex justify-between items-center text-sm">
              <div>
                <div className="text-blue-200 text-xs font-medium mb-0.5">Wpłacono</div>
                <div className="font-bold text-white">{formatMoneyPl(paid ?? 0)}</div>
              </div>
              <div className="text-right">
                <div className="text-blue-200 text-xs font-medium mb-0.5">Pozostało</div>
                <div className="font-bold text-white">{formatMoneyPl(remaining)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* METODY PŁATNOŚCI */}
      <div>
        <div className="flex justify-between items-end mb-3">
          <h2 className="text-xs font-semibold text-blue-900/50 uppercase tracking-wider">Metoda płatności</h2>
          <span className="text-[10px] font-bold text-blue-600 uppercase">
            {paymentMethodPl(paymentMethod)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-2">
          {METHODS.map((m) => {
            const isActive = paymentMethod === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={busy}
                onClick={() => onPaymentMethodChange(m.id)}
                className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border-2 transition-all shadow-sm group ${
                  isActive
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-white text-slate-600 border-slate-100 hover:border-blue-300 hover:text-blue-600"
                } disabled:opacity-50 disabled:hover:border-slate-100 disabled:hover:text-slate-600`}
              >
                <m.Icon size={24} className={isActive ? "text-blue-600" : "text-slate-400 group-hover:text-blue-500"} />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{m.label}</span>
                  {m.key && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isActive ? "bg-blue-200/50 text-blue-600" : "bg-slate-100 text-slate-400"
                    }`}>
                      {m.key}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-400 text-center font-medium">
          Skróty: F1 gotówka · F2 karta · F3 BLIK · Ctrl+Enter zakończ
        </p>
      </div>

      {/* WIELKI PRZYCISK FINALIZACJI */}
      <button
        type="button"
        disabled={busy || !hasSession || !hasLines}
        onClick={onComplete}
        className="w-full py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-emerald-500/30 transition-all flex items-center justify-center gap-3 transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none disabled:hover:bg-emerald-500"
      >
        <CheckCircle size={24} /> Zakończ sprzedaż (Enter)
      </button>

    </div>
  );
}