import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Printer, FileText, ShoppingCart } from "lucide-react";

import { DAMAGE_TENANT_ID } from "../../../constants/panelTenant";
import type { DirectSaleCompletion } from "../../../types/directSalesCompletion";
import { getApiErrorMessage } from "../../../utils/apiError";
import { useDocumentTemplatePrint } from "../../../hooks/useDocumentTemplatePrint";
import { saleKindFromSubtype } from "../../../utils/documentTemplatePrint";
import {
  documentSubtypePl,
  paymentMethodPl,
  paymentStatusPl,
  formatMoneyPl,
  printButtonLabelPl,
} from "../directSalesTerminology";
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
    return new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DirectSalesConfirmationScreen({ completion, onNewSale }: Props) {
  const { requestPrint, pickerModal, printBusy } = useDocumentTemplatePrint({ tenantId: DAMAGE_TENANT_ID });
  const [printError, setPrintError] = useState<string | null>(null);
  const docType = completion.document_subtype === "INVOICE" ? "FV" : "PA";
  const saleDocId = completion.sale_document_id ?? completion.document?.sale_document_id ?? null;
  const stockDocId = completion.stock_document_id ?? null;

  const handlePrintSaleDocument = () => {
    if (!saleDocId) return;
    setPrintError(null);
    void requestPrint({
      kind: "sale_document",
      documentId: saleDocId,
      kindCode: saleKindFromSubtype(completion.document_subtype ?? docType),
    }).catch((err) => {
      const msg = getApiErrorMessage(err) || "Nie udało się wygenerować PDF dokumentu.";
      console.error("[DirectSales.printSale]", msg, err);
      setPrintError(msg);
    });
  };

  const handlePrintWz = () => {
    if (stockDocId == null) return;
    setPrintError(null);
    void requestPrint({ kind: "stock_document", documentId: stockDocId, kindCode: "wz" }).catch((err) => {
      const msg = getApiErrorMessage(err) || "Nie udało się wygenerować PDF dokumentu.";
      console.error("[DirectSales.printWz]", msg, err);
      setPrintError(msg);
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white p-4 lg:p-8 custom-scrollbar">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-emerald-100 bg-white p-8 shadow-[0_20px_50px_-15px_rgba(16,185,129,0.15)]">
          <div className="absolute right-0 top-0 p-12 opacity-5">
            <CheckCircle2 size={200} />
          </div>

          <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-600">
                <CheckCircle2 size={16} /> Sprzedaż zakończona pomyślnie
              </div>
              <h2 className="text-5xl font-black tracking-tight text-slate-900">
                {formatMoneyPl(completion.total_amount)}
              </h2>
              <p className="mt-4 font-medium text-slate-500">
                Zamówienie <strong className="text-slate-900">{completion.order_number ?? `#${completion.order_id}`}</strong>
                {completion.document_number ? (
                  <> • Dok. <strong className="text-slate-900">{completion.document_number}</strong> ({documentSubtypePl(completion.document_subtype) || docType})</>
                ) : null}
              </p>
            </div>

            <DocumentStatusBadge
              status={completion.document?.status}
              statusLabel={completion.document?.status_label ?? "Dokument"}
              fiscalStatus={completion.document?.fiscal_status}
            />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-6 border-t border-slate-100 pt-6 md:grid-cols-4">
            {[
              {
                label: "Płatność",
                val: `${completion.payment_method_label ?? paymentMethodPl(completion.payment_method)} · ${completion.payment_status_label ?? paymentStatusPl(completion.payment_status)}`,
              },
              { label: "Operator", val: completion.operator_label ?? "—" },
              { label: "Data", val: formatCompletedAt(completion.completed_at) },
              { label: "Sesja", val: `#${completion.session_id}` },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</div>
                <div className="mt-0.5 text-sm font-bold text-slate-800">{item.val}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onNewSale}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white transition-all hover:bg-emerald-700"
            >
              <ShoppingCart size={18} /> Nowa sprzedaż
            </button>
            {saleDocId ? (
              <button
                type="button"
                disabled={printBusy}
                onClick={() => void handlePrintSaleDocument()}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 px-6 py-3 font-bold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                <Printer size={18} /> {printButtonLabelPl(completion.document_subtype)}
              </button>
            ) : null}
            {stockDocId ? (
              <button
                type="button"
                disabled={printBusy}
                onClick={() => void handlePrintWz()}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 px-6 py-3 font-bold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
              >
                <Printer size={18} /> Drukuj WZ
              </button>
            ) : null}
            <Link
              to={`/orders/${completion.order_id}`}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 px-6 py-3 font-bold text-slate-700 transition-all hover:bg-slate-50"
            >
              <FileText size={18} /> Zamówienie
            </Link>
          </div>
          {printError ? <p className="mt-4 text-xs font-bold text-red-700">{printError}</p> : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
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
      {pickerModal}
    </div>
  );
}
