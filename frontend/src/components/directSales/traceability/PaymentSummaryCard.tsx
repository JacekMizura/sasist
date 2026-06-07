import type { DirectSalePaymentDetail } from "../../../types/directSalesCompletion";
import { paymentMethodPl, paymentStatusPl } from "../directSalesTerminology";

type Props = {
  payment: DirectSalePaymentDetail | null;
  fallbackMethod?: string | null;
  fallbackStatus?: string | null;
};

export function PaymentSummaryCard({ payment, fallbackMethod, fallbackStatus }: Props) {
  const method = payment?.method ?? fallbackMethod;
  const status = payment?.status ?? fallbackStatus;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
      <h4 className="mb-2 font-semibold uppercase tracking-wide text-slate-600">Płatność</h4>
      <dl className="space-y-1 text-slate-700">
        <div className="flex justify-between">
          <dt>Metoda</dt>
          <dd className="font-medium">{paymentMethodPl(method)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Status</dt>
          <dd>{paymentStatusPl(status)}</dd>
        </div>
        {payment?.amount != null ? (
          <div className="flex justify-between">
            <dt>Kwota</dt>
            <dd className="font-semibold">{payment.amount.toFixed(2)} zł</dd>
          </div>
        ) : null}
        {payment?.authorization_reference ? (
          <div className="flex justify-between gap-2">
            <dt>Autoryzacja</dt>
            <dd className="truncate font-mono text-[10px]">{payment.authorization_reference}</dd>
          </div>
        ) : null}
        {payment?.external_transaction_id ? (
          <div className="flex justify-between gap-2">
            <dt>Transakcja</dt>
            <dd className="truncate font-mono text-[10px]">{payment.external_transaction_id}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
