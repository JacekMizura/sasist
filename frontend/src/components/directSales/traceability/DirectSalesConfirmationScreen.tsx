import { useState } from "react";
import { Link } from "react-router-dom";

import { reprintDirectSaleDocument } from "../../../api/directSalesApi";
import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";
import type { DirectSaleCompletion } from "../../../types/directSalesCompletion";
import { paymentMethodPl } from "../directSalesTerminology";
import { DocumentStatusBadge } from "../documents/DocumentStatusBadge";
import { DirectSalesTraceabilityPanel } from "./DirectSalesTraceabilityPanel";
import { PaymentSummaryCard } from "./PaymentSummaryCard";

type Props = {
  completion: DirectSaleCompletion;
  onNewSale: () => void;
  onRefreshCompletion?: () => void;
};

function formatCompletedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL");
  } catch {
    return iso;
  }
}

export function DirectSalesConfirmationScreen({ completion, onNewSale, onRefreshCompletion }: Props) {
  const [reprintBusy, setReprintBusy] = useState(false);
  const [reprintMsg, setReprintMsg] = useState<string | null>(null);
  const docType = completion.document_subtype === "INVOICE" ? "FV" : "PA";

  const handleReprint = async () => {
    const jobId = completion.document?.job_id ?? completion.document_job_id;
    if (!jobId) return;
    setReprintBusy(true);
    setReprintMsg(null);
    try {
      const warehouseId = completion.warehouse_id;
      if (warehouseId == null) throw new Error("missing warehouse_id");
      const res = await reprintDirectSaleDocument({ tenantId: DAMAGE_TENANT_ID, warehouseId, jobId });
      setReprintMsg(res.message);
      onRefreshCompletion?.();
    } catch {
      setReprintMsg("Nie udało się zlecić ponownego generowania.");
    } finally {
      setReprintBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-emerald-50/40 p-3 md:p-4">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Sprzedaż zaksięgowana</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">{completion.total_amount.toFixed(2)} zł</h2>
              <p className="mt-1 text-sm text-slate-600">
                Zamówienie{" "}
                <strong>{completion.order_number ?? `#${completion.order_id}`}</strong>
                {completion.document_number ? (
                  <>
                    {" "}
                    · Dokument <strong>{completion.document_number}</strong> ({docType})
                  </>
                ) : null}
              </p>
            </div>
            <DocumentStatusBadge
              status={completion.document?.status}
              statusLabel={completion.document?.status_label ?? "Dokument"}
              fiscalStatus={completion.document?.fiscal_status}
            />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 md:grid-cols-4">
            <div>
              <dt className="text-slate-400">Płatność</dt>
              <dd className="font-medium text-slate-800">
                {paymentMethodPl(completion.payment_method)} · {completion.payment_status ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Operator</dt>
              <dd>{completion.operator_label ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Data</dt>
              <dd>{formatCompletedAt(completion.completed_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Sesja</dt>
              <dd>#{completion.session_id}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onNewSale}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Nowa sprzedaż
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
              Drukuj dokument
            </button>
            <Link
              to={`/orders/${completion.order_id}`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800"
            >
              Pokaż zamówienie
            </Link>
            {completion.document?.job_id ? (
              <button
                type="button"
                disabled={reprintBusy}
                onClick={() => void handleReprint()}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 disabled:opacity-50"
              >
                {reprintBusy ? "Zlecanie…" : "Wygeneruj ponownie"}
              </button>
            ) : null}
          </div>
          {reprintMsg ? <p className="mt-2 text-xs text-amber-800">{reprintMsg}</p> : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DirectSalesTraceabilityPanel completion={completion} />
          </div>
          <PaymentSummaryCard
            payment={completion.payment}
            fallbackMethod={completion.payment_method}
            fallbackStatus={completion.payment_status}
          />
        </div>
      </div>
    </div>
  );
}
