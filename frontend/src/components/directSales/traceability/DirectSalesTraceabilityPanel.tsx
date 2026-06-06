import type { DirectSaleCompletion } from "../../../types/directSalesCompletion";
import { DocumentStatusBadge } from "../documents/DocumentStatusBadge";
import { MovementTimeline } from "./MovementTimeline";
import { StockDeltaList } from "./StockDeltaList";
import { Package, Clock, FileText } from "lucide-react";

type Props = {
  completion: DirectSaleCompletion;
};

export function DirectSalesTraceabilityPanel({ completion }: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      
      {/* LEWA STRONA: Wydania i Zmiany stanu */}
      <div className="space-y-6">
        <div className="bg-white rounded-3xl border border-blue-50 p-6 shadow-sm">
          <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-blue-900/40 flex items-center gap-2">
            <Package size={14} /> Wydane pozycje
          </h4>
          
          {completion.lines.length ? (
            <ul className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
              {completion.lines.map((ln) => (
                <li key={`${ln.product_id}-${ln.movement_id}`} className="pb-3 border-b border-blue-50 last:border-0 last:pb-0">
                  <div className="font-bold text-slate-800 text-sm">
                    {ln.product_name ?? `Produkt #${ln.product_id}`}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span className="font-semibold text-blue-600">{ln.issued_qty} szt.</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{ln.source_location_code ?? "—"}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">
                    Ruch #{ln.movement_id ?? "—"}
                    {ln.reservation_id ? ` • Rezerwacja #${ln.reservation_id}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 italic">Brak danych wydania.</p>
          )}
        </div>
        
        <StockDeltaList deltas={completion.stock_deltas} />
      </div>

      {/* PRAWA STRONA: Oś czasu i Dokument */}
      <div className="space-y-6">
        <div className="bg-white rounded-3xl border border-blue-50 p-6 shadow-sm">
          <h4 className="mb-6 text-[10px] font-bold uppercase tracking-widest text-blue-900/40 flex items-center gap-2">
            <Clock size={14} /> Oś czasu operacji
          </h4>
          <MovementTimeline events={completion.timeline} />
        </div>

        {completion.document ? (
          <div className="bg-white rounded-3xl border border-blue-50 p-6 shadow-sm">
            <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-blue-900/40 flex items-center gap-2">
              <FileText size={14} /> Dokument
            </h4>
            
            <div className="mb-4">
              <div className="text-lg font-black text-slate-900">
                {completion.document.document_number ?? "—"}
              </div>
              <div className="text-xs font-medium text-slate-500">
                {completion.document.document_subtype === "INVOICE" ? "Faktura VAT (FV)" : "Paragon (PA)"}
              </div>
            </div>
            
            <DocumentStatusBadge
              status={completion.document.status}
              statusLabel={completion.document.status_label}
              fiscalStatus={completion.document.fiscal_status}
            />
            
            {completion.document.error_message ? (
              <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-100">
                {completion.document.error_message}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      
    </div>
  );
}