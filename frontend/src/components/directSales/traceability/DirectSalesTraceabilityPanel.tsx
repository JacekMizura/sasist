import type { DirectSaleCompletion } from "../../../types/directSalesCompletion";
import { DocumentStatusBadge } from "../documents/DocumentStatusBadge";
import { MovementTimeline } from "./MovementTimeline";
import { StockDeltaList } from "./StockDeltaList";

type Props = {
  completion: DirectSaleCompletion;
};

export function DirectSalesTraceabilityPanel({ completion }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Wydane pozycje
          </h4>
          {completion.lines.length ? (
            <ul className="max-h-48 space-y-2 overflow-auto text-xs">
              {completion.lines.map((ln) => (
                <li key={`${ln.product_id}-${ln.movement_id}`} className="border-b border-slate-100 pb-1">
                  <div className="font-medium text-slate-900">{ln.product_name ?? `Produkt #${ln.product_id}`}</div>
                  <div className="text-slate-500">
                    {ln.issued_qty} szt. · {ln.source_location_code ?? "—"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Ruch #{ln.movement_id ?? "—"}
                    {ln.reservation_id ? ` · Rezerwacja #${ln.reservation_id}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">Brak danych wydania.</p>
          )}
        </div>
        <StockDeltaList deltas={completion.stock_deltas} />
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Oś czasu operacji
          </h4>
          <MovementTimeline events={completion.timeline} />
        </div>
        {completion.document ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <h4 className="mb-2 font-semibold uppercase tracking-wide text-slate-600">Dokument</h4>
            <div className="mb-1 font-medium text-slate-900">
              {completion.document.document_number ?? "—"}{" "}
              <span className="text-slate-500">
                ({completion.document.document_subtype === "INVOICE" ? "FV" : "PA"})
              </span>
            </div>
            <DocumentStatusBadge
              status={completion.document.status}
              statusLabel={completion.document.status_label}
              fiscalStatus={completion.document.fiscal_status}
            />
            {completion.document.error_message ? (
              <p className="mt-2 text-red-700">{completion.document.error_message}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
