import { Link } from "react-router-dom";
import { ExternalLink, MapPin, Package } from "lucide-react";

import { warehouseStockDocumentPath } from "../../../utils/stockDocumentPaths";
import { WMS_ROUTES } from "../../wms/wmsRoutes";

export type ProductionPwDocumentRow = {
  id: number;
  number?: string | null;
  putawayStatus?: string | null;
  productName?: string | null;
};

type Props = {
  rwDocumentId?: number | null;
  rwDocumentNumber?: string | null;
  pwDocuments: ProductionPwDocumentRow[];
};

export function putawayStatusLabel(status?: string | null): string {
  const s = String(status || "").trim().toUpperCase();
  if (s === "DONE") return "Zakończone";
  if (!s || s === "OPEN") return "Oczekuje na rozlokowanie";
  if (s === "IN_PROGRESS") return "Rozlokowanie w toku";
  return status ?? "—";
}

export function putawayStatusBadgeClass(status?: string | null): string {
  const s = String(status || "").trim().toUpperCase();
  if (s === "DONE") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (s === "IN_PROGRESS") return "bg-sky-50 text-sky-800 ring-sky-200";
  return "bg-amber-50 text-amber-900 ring-amber-200";
}

export function ProductionDocumentsSection({ rwDocumentId, rwDocumentNumber, pwDocuments }: Props) {
  if (!rwDocumentId && pwDocuments.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Dokumenty produkcyjne</h3>

      {rwDocumentId ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">RW</span>
          <Link
            to={warehouseStockDocumentPath("RW", rwDocumentId)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-800 hover:text-violet-800"
          >
            <Package className="h-4 w-4 text-slate-400" aria-hidden />
            {rwDocumentNumber ?? `#${rwDocumentId}`}
            <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden />
          </Link>
        </div>
      ) : null}

      {pwDocuments.length > 0 ? (
        <div className="space-y-3">
          {pwDocuments.map((pw) => {
            const done = String(pw.putawayStatus || "").toUpperCase() === "DONE";
            return (
              <div
                key={pw.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">PW</span>
                    <Link
                      to={warehouseStockDocumentPath("PW", pw.id)}
                      className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-900 hover:text-violet-800"
                    >
                      {pw.number ?? `#${pw.id}`}
                      <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden />
                    </Link>
                  </div>
                  {pw.productName ? <p className="text-xs text-slate-500">{pw.productName}</p> : null}
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${putawayStatusBadgeClass(pw.putawayStatus)}`}>
                    {putawayStatusLabel(pw.putawayStatus)}
                  </span>
                </div>
                {!done ? (
                  <Link
                    to={WMS_ROUTES.putawayPz(pw.id)}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <MapPin className="h-4 w-4" aria-hidden />
                    Rozlokuj w WMS
                  </Link>
                ) : (
                  <span className="text-xs font-medium text-emerald-700">Rozlokowanie zakończone</span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function pwDocumentsFromBatchLines(
  lines: Array<{
    pw_stock_document_id?: number | null;
    pw_document_number?: string | null;
    pw_putaway_status?: string | null;
    product_name?: string | null;
  }>,
): ProductionPwDocumentRow[] {
  return (lines ?? [])
    .filter((ln) => ln.pw_stock_document_id != null && ln.pw_stock_document_id > 0)
    .map((ln) => ({
      id: ln.pw_stock_document_id!,
      number: ln.pw_document_number,
      putawayStatus: ln.pw_putaway_status,
      productName: ln.product_name,
    }));
}

export function pwDocumentsFromOrder(order: {
  pw_stock_document_id?: number | null;
  pw_document_number?: string | null;
  pw_putaway_status?: string | null;
  product_name?: string | null;
}): ProductionPwDocumentRow[] {
  if (!order.pw_stock_document_id) return [];
  return [
    {
      id: order.pw_stock_document_id,
      number: order.pw_document_number,
      putawayStatus: order.pw_putaway_status,
      productName: order.product_name,
    },
  ];
}
