import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, RotateCcw, Printer, FileText, ShoppingCart, ArrowRight } from "lucide-react";

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
    <div className="flex-1 overflow-y-auto bg-white p-4 lg:p-8 custom-scrollbar">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        
        {/* Karta Sukcesu */}
        <div className="bg-white rounded-[2rem] border-2 border-emerald-100 p-8 shadow-[0_20px_50px_-15px_rgba(16,185,129,0.15)] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-5">
            <CheckCircle2 size={200} />
          </div>

          <div className="flex flex-wrap items-start justify-between gap-6 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 text-emerald-600 font-black uppercase tracking-widest text-xs mb-3">
                <CheckCircle2 size={16} /> Sprzedaż zakończona pomyślnie
              </div>
              <h2 className="text-5xl font-black text-slate-900 tracking-tight">
                {completion.total_amount.toFixed(2)} <span className="text-2xl text-slate-400">zł</span>
              </h2>
              <p className="mt-4 text-slate-500 font-medium">
                Zamówienie <strong className="text-slate-900">{completion.order_number ?? `#${completion.order_id}`}</strong>
                {completion.document_number ? (
                  <> • Dok. <strong className="text-slate-900">{completion.document_number}</strong> ({docType})</>
                ) : null}
              </p>
            </div>
            
            <DocumentStatusBadge
              status={completion.document?.status}
              statusLabel={completion.document?.status_label ?? "Dokument"}
              fiscalStatus={completion.document?.fiscal_status}
            />
          </div>

          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-slate-100 pt-6">
            {[
              { label: "Płatność", val: `${paymentMethodPl(completion.payment_method)}` },
              { label: "Operator", val: completion.operator_label ?? "—" },
              { label: "Data", val: formatCompletedAt(completion.completed_at) },
              { label: "Sesja", val: `#${completion.session_id}` },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{item.label}</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">{item.val}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={onNewSale} className="flex items-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 font-bold transition-all">
              <ShoppingCart size={18} /> Nowa sprzedaż
            </button>
            <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-3 font-bold transition-all">
              <Printer size={18} /> Drukuj
            </button>
            <Link to={`/orders/${completion.order_id}`} className="flex items-center gap-2 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-3 font-bold transition-all">
              <FileText size={18} /> Zamówienie
            </Link>
            {completion.document?.job_id ? (
              <button type="button" disabled={reprintBusy} onClick={() => void handleReprint()} className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 px-6 py-3 font-bold transition-all">
                <RotateCcw size={18} /> {reprintBusy ? "Zlecanie…" : "Wygeneruj ponownie"}
              </button>
            ) : null}
          </div>
          {reprintMsg ? <p className="mt-4 text-xs font-bold text-amber-700">{reprintMsg}</p> : null}
        </div>

        {/* Traceability i Płatność */}
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
    </div>
  );
}