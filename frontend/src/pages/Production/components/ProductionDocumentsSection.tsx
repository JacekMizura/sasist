import { Link } from "react-router-dom";
import { ExternalLink, Package } from "lucide-react";

import { Card, StatusBadge, typography, type StatusTone } from "@/design-system";
import { warehouseStockDocumentPath } from "../../../utils/stockDocumentPaths";

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

function putawayTone(status?: string | null): StatusTone {
  const s = String(status || "").trim().toUpperCase();
  if (s === "DONE") return "success";
  if (s === "IN_PROGRESS") return "info";
  return "warning";
}

/** @deprecated Prefer StatusBadge + putawayTone */
export function putawayStatusBadgeClass(status?: string | null): string {
  const s = String(status || "").trim().toUpperCase();
  if (s === "DONE") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (s === "IN_PROGRESS") return "bg-sky-50 text-sky-800 ring-sky-200";
  return "bg-amber-50 text-amber-900 ring-amber-200";
}

export function ProductionDocumentsSection({ rwDocumentId, rwDocumentNumber, pwDocuments }: Props) {
  if (!rwDocumentId && pwDocuments.length === 0) return null;

  return (
    <Card variant="section" density="comfortable" className="space-y-3">
      <h3 className={typography.section}>Dokumenty</h3>

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rwDocumentId ? (
          <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">RW</p>
              <Link
                to={warehouseStockDocumentPath("RW", rwDocumentId)}
                className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-900 hover:text-slate-700"
              >
                <Package className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {rwDocumentNumber ?? `#${rwDocumentId}`}
                <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden />
              </Link>
            </div>
            <StatusBadge tone="neutral" density="compact">
              Wystawiony
            </StatusBadge>
          </li>
        ) : null}

        {pwDocuments.map((pw) => (
          <li key={pw.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">PW</p>
              <Link
                to={warehouseStockDocumentPath("PW", pw.id)}
                className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-900 hover:text-slate-700"
              >
                {pw.number ?? `#${pw.id}`}
                <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden />
              </Link>
              {pw.productName ? <p className="mt-0.5 text-xs text-slate-500">{pw.productName}</p> : null}
            </div>
            <div className="text-right">
              <p className="mb-1 text-xs font-medium text-slate-500">Status PW</p>
              <StatusBadge tone={putawayTone(pw.putawayStatus)} density="compact">
                {putawayStatusLabel(pw.putawayStatus)}
              </StatusBadge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
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
