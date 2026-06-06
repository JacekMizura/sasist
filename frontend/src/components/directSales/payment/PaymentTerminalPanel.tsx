import type { DirectSaleSession } from "../../../utils/normalizeDirectSales";
import { paymentMethodPl, sessionStatusPl } from "../directSalesTerminology";
import { CashChangePanel } from "./CashChangePanel";

const METHODS = [
  { id: "CASH", label: "Gotówka", key: "F1" },
  { id: "CARD", label: "Karta", key: "F2" },
  { id: "BLIK", label: "BLIK", key: "F3" },
] as const;

type Props = {
  total: number;
  busy: boolean;
  hasSession: boolean;
  hasLines: boolean;
  session: DirectSaleSession | null;
  paymentMethod: string;
  cashReceived: number;
  onCashReceivedChange: (value: number) => void;
  onPaymentMethodChange: (method: string) => void;
  onComplete: () => void;
};

export function PaymentTerminalPanel({
  total,
  busy,
  hasSession,
  hasLines,
  session,
  paymentMethod,
  cashReceived,
  onCashReceivedChange,
  onPaymentMethodChange,
  onComplete,
}: Props) {
  const isCash = paymentMethod === "CASH";
  const canComplete = hasSession && hasLines && (!isCash || cashReceived + 1e-9 >= total);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-white">
        <div className="text-xs uppercase tracking-wide text-slate-400">Do zapłaty</div>
        <div className="mt-1 text-4xl font-bold tabular-nums">{total.toFixed(2)} zł</div>
        {session?.status ? (
          <div className="mt-1 text-[11px] text-slate-400">Sesja: {sessionStatusPl(session.status)}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={busy}
            onClick={() => onPaymentMethodChange(m.id)}
            className={`rounded-xl px-2 py-3 text-sm font-semibold disabled:opacity-50 ${
              paymentMethod === m.id
                ? "bg-slate-800 text-white"
                : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            {m.label}
            <span className="ml-1 text-[10px] opacity-60">{m.key}</span>
          </button>
        ))}
      </div>

      {isCash ? (
        <CashChangePanel
          total={total}
          received={cashReceived}
          onReceivedChange={onCashReceivedChange}
          disabled={busy}
        />
      ) : (
        <p className="text-center text-xs text-slate-500">Wybrano: {paymentMethodPl(paymentMethod)}</p>
      )}

      <button
        type="button"
        disabled={busy || !canComplete}
        onClick={onComplete}
        className="w-full rounded-xl bg-emerald-600 px-4 py-4 text-base font-bold text-white shadow-sm disabled:opacity-50"
      >
        Zakończ sprzedaż (Enter)
      </button>
    </div>
  );
}
