import { useMemo } from "react";

import { useResolvedDirectSalesSettings } from "../../../modules/directSales/settings/resolvedDirectSalesSettings";
import type { DirectSaleFulfillment, DirectSaleSession } from "../../../utils/normalizeDirectSales";
import { formatMoneyPl, paymentMethodPl } from "../directSalesTerminology";
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
  total: number;
  busy: boolean;
  hasSession: boolean;
  hasLines: boolean;
  session: DirectSaleSession | null;
  fulfillment: DirectSaleFulfillment;
  customerPaymentTermsDays: number | null;
  paymentMethod: string;
  cashReceived: number;
  mixedCashAmount: number;
  mixedCardAmount: number;
  onCashReceivedChange: (value: number) => void;
  onMixedCashChange: (value: number) => void;
  onMixedCardChange: (value: number) => void;
  onPaymentMethodChange: (method: string) => void;
  onPaymentTermsChange: (mode: "IMMEDIATE" | "DEFERRED", days: number | null) => void;
  onComplete: () => void;
};

export function PaymentTerminalPanel({
  total,
  busy,
  hasSession,
  hasLines,
  session,
  fulfillment,
  customerPaymentTermsDays,
  paymentMethod,
  cashReceived,
  mixedCashAmount,
  mixedCardAmount,
  onCashReceivedChange,
  onMixedCashChange,
  onMixedCardChange,
  onPaymentMethodChange,
  onPaymentTermsChange,
  onComplete,
}: Props) {
  const resolvedDirectSalesSettings = useResolvedDirectSalesSettings();
  const methods = useMemo(() => {
    const pm = resolvedDirectSalesSettings.payment_methods;
    return ALL_METHODS.filter((m) => {
      if (m.id === "CASH") return pm.cash;
      if (m.id === "CARD") return pm.card;
      if (m.id === "BLIK") return pm.blik;
      if (m.id === "TRANSFER") return pm.transfer !== false;
      if (m.id === "MIXED") return pm.mixed;
      return false;
    });
  }, [resolvedDirectSalesSettings.payment_methods]);

  const isCash = paymentMethod === "CASH";
  const isMixed = paymentMethod === "MIXED";
  const isTransfer = paymentMethod === "TRANSFER";
  const mixedSum = mixedCashAmount + mixedCardAmount;
  const mixedOk = Math.abs(mixedSum - total) <= 0.02 && mixedSum > 0;
  const cashOk =
    !resolvedDirectSalesSettings.require_cash_received ||
    resolvedDirectSalesSettings.allow_incomplete_payment ||
    cashReceived + 1e-9 >= total;
  const canComplete =
    hasSession &&
    hasLines &&
    methods.length > 0 &&
    (isMixed ? mixedOk : !isCash || cashOk);

  const deferredDays =
    fulfillment.payment_terms_days ??
    (customerPaymentTermsDays != null && customerPaymentTermsDays > 0 ? customerPaymentTermsDays : null);

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-900/50">Metoda płatności</h2>
          <span className="text-[10px] font-bold uppercase text-blue-600">{paymentMethodPl(paymentMethod)}</span>
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
      </div>

      {isTransfer ? (
        <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Termin płatności</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onPaymentTermsChange("IMMEDIATE", null)}
              className={`rounded-xl px-2 py-2 text-xs font-bold ${
                fulfillment.payment_terms_mode === "IMMEDIATE"
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              Natychmiast
            </button>
            <button
              type="button"
              disabled={busy || deferredDays == null}
              title={
                deferredDays == null
                  ? "Brak terminu na karcie klienta (payment_terms_days)"
                  : `Termin klienta: ${deferredDays} dni`
              }
              onClick={() => onPaymentTermsChange("DEFERRED", deferredDays)}
              className={`rounded-xl px-2 py-2 text-xs font-bold disabled:opacity-40 ${
                fulfillment.payment_terms_mode === "DEFERRED"
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              {deferredDays != null ? `Termin ${deferredDays} dni` : "Termin klienta"}
            </button>
          </div>
          {fulfillment.payment_terms_mode === "DEFERRED" ? (
            <p className="text-[10px] font-medium text-slate-500">
              Płatność pozostanie w statusie oczekującym (bez natychmiastowego PAID).
            </p>
          ) : null}
        </div>
      ) : null}

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

      {isCash && resolvedDirectSalesSettings.show_change_amount ? (
        <CashChangePanel
          total={total}
          received={cashReceived}
          onReceivedChange={onCashReceivedChange}
          disabled={busy}
        />
      ) : null}

      {!isCash && !isMixed && !isTransfer ? (
        <p className="text-center text-xs text-slate-500">Wybrano: {paymentMethodPl(paymentMethod)}</p>
      ) : null}

      {session?.status === "CHECKOUT" ? (
        <p className="text-center text-[10px] font-medium text-slate-400">Sesja w checkout — do zapłaty {formatMoneyPl(total)}</p>
      ) : null}

      <button
        type="button"
        disabled={busy || !canComplete}
        onClick={onComplete}
        className="w-full rounded-xl bg-emerald-600 px-4 py-4 text-base font-bold text-white shadow-sm disabled:opacity-50"
      >
        Realizuj
      </button>
    </div>
  );
}
