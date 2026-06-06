import { useMemo } from "react";

import type { DirectSalesSettingsConfig } from "../../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";
import type { DirectSaleSession } from "../../../utils/normalizeDirectSales";
import { paymentMethodPl, sessionStatusPl } from "../directSalesTerminology";
import { CashChangePanel } from "./CashChangePanel";
import { MixedPaymentPanel } from "./MixedPaymentPanel";

const ALL_METHODS = [
  { id: "CASH", label: "Gotówka", key: "F1" },
  { id: "CARD", label: "Karta", key: "F2" },
  { id: "BLIK", label: "BLIK", key: "F3" },
  { id: "TRANSFER", label: "Przelew", key: null },
  { id: "MIXED", label: "Mieszana", key: null },
] as const;

type Props = {
  settings: DirectSalesSettingsConfig;
  total: number;
  busy: boolean;
  hasSession: boolean;
  hasLines: boolean;
  session: DirectSaleSession | null;
  paymentMethod: string;
  cashReceived: number;
  mixedCashAmount: number;
  mixedCardAmount: number;
  onCashReceivedChange: (value: number) => void;
  onMixedCashChange: (value: number) => void;
  onMixedCardChange: (value: number) => void;
  onPaymentMethodChange: (method: string) => void;
  onComplete: () => void;
};

export function PaymentTerminalPanel({
  settings,
  total,
  busy,
  hasSession,
  hasLines,
  session,
  paymentMethod,
  cashReceived,
  mixedCashAmount,
  mixedCardAmount,
  onCashReceivedChange,
  onMixedCashChange,
  onMixedCardChange,
  onPaymentMethodChange,
  onComplete,
}: Props) {
  const methods = useMemo(() => {
    const pm = settings.payment_methods;
    return ALL_METHODS.filter((m) => {
      if (m.id === "CASH") return pm.cash;
      if (m.id === "CARD") return pm.card;
      if (m.id === "BLIK") return pm.blik;
      if (m.id === "TRANSFER") return pm.transfer;
      if (m.id === "MIXED") return pm.mixed;
      return false;
    });
  }, [settings.payment_methods]);

  const isCash = paymentMethod === "CASH";
  const isMixed = paymentMethod === "MIXED";
  const remaining = Math.max(0, total - cashReceived);
  const mixedSum = mixedCashAmount + mixedCardAmount;
  const mixedOk = Math.abs(mixedSum - total) <= 0.02 && mixedSum > 0;
  const cashOk =
    !settings.require_cash_received ||
    settings.allow_incomplete_payment ||
    cashReceived + 1e-9 >= total;
  const canComplete =
    hasSession &&
    hasLines &&
    methods.length > 0 &&
    (isMixed ? mixedOk : !isCash || cashOk);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-white">
        <div className="text-xs uppercase tracking-wide text-slate-400">Do zapłaty</div>
        <div className="mt-1 text-4xl font-bold tabular-nums">{total.toFixed(2)} zł</div>
        {isCash && cashReceived > 0 && remaining > 0.009 ? (
          <div className="mt-1 text-sm text-amber-300">Pozostało: {remaining.toFixed(2)} zł</div>
        ) : null}
        {session?.status ? (
          <div className="mt-1 text-[11px] text-slate-400">Sesja: {sessionStatusPl(session.status)}</div>
        ) : null}
      </div>

      {methods.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Brak włączonych metod płatności w ustawieniach sprzedaży bezpośredniej.
        </p>
      ) : (
        <div className={`grid gap-1.5 ${methods.length <= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {methods.map((m) => (
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
              {m.key ? <span className="ml-1 text-[10px] opacity-60">{m.key}</span> : null}
            </button>
          ))}
        </div>
      )}

      {isMixed ? (
        <MixedPaymentPanel
          total={total}
          cashAmount={mixedCashAmount}
          cardAmount={mixedCardAmount}
          onCashChange={onMixedCashChange}
          onCardChange={onMixedCardChange}
          disabled={busy}
        />
      ) : null}

      {isCash && settings.show_change_amount ? (
        <CashChangePanel
          total={total}
          received={cashReceived}
          onReceivedChange={onCashReceivedChange}
          disabled={busy}
        />
      ) : !isCash ? (
        <p className="text-center text-xs text-slate-500">Wybrano: {paymentMethodPl(paymentMethod)}</p>
      ) : null}

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
