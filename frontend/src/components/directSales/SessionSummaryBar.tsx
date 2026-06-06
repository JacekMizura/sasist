import type { DirectSaleCompleteResult } from "../../utils/normalizeDirectSales";
import { paymentMethodPl } from "./directSalesTerminology";
import { safeDisplay } from "../../utils/safeStrings";

type Props = {
  result: DirectSaleCompleteResult;
  onPrint: () => void;
  onNewSession: () => void;
};

export function SessionSummaryBar({ result, onPrint, onNewSession }: Props) {
  const docLabel = result.document_number
    ? result.document_number
    : result.document_job_id
      ? `Kolejka #${result.document_job_id}`
      : "—";

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Sprzedaż zakończona</div>
      <dl className="mt-2 space-y-1 text-sm text-emerald-900">
        <div className="flex justify-between gap-2">
          <dt className="text-emerald-700">Dokument</dt>
          <dd className="font-medium">{docLabel}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-emerald-700">Płatność</dt>
          <dd>
            {safeDisplay(result.payment_status, "Zakończone")}
            {result.payment_method ? ` · ${paymentMethodPl(result.payment_method)}` : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-emerald-700">Suma</dt>
          <dd className="font-bold">{result.total_amount.toFixed(2)} zł</dd>
        </div>
      </dl>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onPrint}
          className="flex-1 rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-xs font-medium text-emerald-800"
        >
          Drukuj
        </button>
        <button
          type="button"
          onClick={onNewSession}
          className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white"
        >
          Nowa sesja
        </button>
      </div>
    </div>
  );
}
