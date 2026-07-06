import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { StockDocumentRead } from "../../api/stockDocumentsApi";
import { documentCreatedByLabel } from "../../utils/documentCreatedBy";
import { formatMoneyPl } from "../../utils/formatOrderMoney";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { ExternalStatusBadge } from "./documentsBadges";
import {
  WarehouseDocCompactRow,
  WarehouseDocSummaryBar,
  WarehouseDocSummaryItem,
  WarehouseDocSummarySeparator,
  warehouseDocInfoCardClass,
} from "./warehouseDocumentDetailUi";
import type { BusinessDocStatus } from "./warehouseDocumentsUi";

function formatDt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtMoneyCur(n: number | null | undefined, currency: string | undefined) {
  const c = (currency || "PLN").trim() || "PLN";
  if (n == null || !Number.isFinite(n)) return "—";
  if (c === "PLN" || c === "zł") return formatMoneyPl(n);
  return formatMoneyPl(n, { currency: c });
}

function fmtQty(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return n.toLocaleString("pl-PL", { maximumFractionDigits: 3 });
}

type Props = {
  detail: StockDocumentRead;
  status: BusinessDocStatus;
  loading?: boolean;
  error?: string | null;
  layout?: "page" | "embedded";
  backLink?: ReactNode;
};

export function WarehouseZPzDocumentDetail({
  detail,
  status,
  loading,
  error,
  layout = "embedded",
  backLink,
}: Props) {
  const docNumber = displayWarehouseDocumentNumber(detail.document_number) || `#${detail.id}`;
  const currency = detail.currency || "PLN";

  let lineCount = 0;
  let unitCount = 0;
  let valueSum = 0;
  let hasValue = false;
  for (const it of detail.items) {
    lineCount += 1;
    const qty = Number(it.received_quantity) || Number(it.quantity) || 0;
    unitCount += qty;
    if (it.value_net != null && Number.isFinite(it.value_net)) {
      valueSum += it.value_net;
      hasValue = true;
    }
  }
  const docValue =
    detail.total_net != null && Number.isFinite(detail.total_net)
      ? detail.total_net
      : hasValue
        ? valueSum
        : null;

  const shellCls =
    layout === "page"
      ? "flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm"
      : "flex min-h-0 flex-col";

  return (
    <div className={shellCls}>
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        {backLink ? <div className="mb-2">{backLink}</div> : null}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dokument magazynowy · Z-PZ</p>
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900">{docNumber}</h1>
          </div>
          <ExternalStatusBadge status={status} />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className={warehouseDocInfoCardClass}>
            <WarehouseDocCompactRow label="Numer dokumentu" value={docNumber} />
            <WarehouseDocCompactRow label="Status" value={<ExternalStatusBadge status={status} />} />
            <WarehouseDocCompactRow
              label="Magazyn"
              value={
                detail.warehouse_id == null
                  ? "—"
                  : (detail.warehouse_name || "").trim() || `#${detail.warehouse_id}`
              }
            />
            <WarehouseDocCompactRow label="Data zamknięcia" value={<span className="tabular-nums">{formatDt(detail.closed_at ?? null)}</span>} />
          </div>
          <div className={warehouseDocInfoCardClass}>
            <WarehouseDocCompactRow label="Typ" value="Z-PZ" />
            <WarehouseDocCompactRow label="Data" value={<span className="tabular-nums">{formatDt(detail.created_at)}</span>} />
            <WarehouseDocCompactRow label="Autor" value={documentCreatedByLabel(detail.created_by) || "—"} />
            <WarehouseDocCompactRow label="Seria" value={(detail.document_series_prefix || "Z-PZ").trim() || "Z-PZ"} />
          </div>
        </div>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      <WarehouseDocSummaryBar
        left={
          <>
            <WarehouseDocSummaryItem label="Pozycji" value={String(lineCount)} />
            <WarehouseDocSummarySeparator />
            <WarehouseDocSummaryItem label="Sztuk" value={fmtQty(unitCount)} />
          </>
        }
        right={
          <WarehouseDocSummaryItem label="Wartość netto" value={fmtMoneyCur(docValue, currency)} />
        }
      />

      <div className={`min-h-0 flex-1 overflow-hidden px-4 py-2 ${layout === "page" ? "" : ""}`}>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500">Wczytywanie…</div>
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-1.5">Produkt</th>
                    <th className="px-2 py-1.5">SKU</th>
                    <th className="px-2 py-1.5">EAN</th>
                    <th className="px-2 py-1.5 text-right">Ilość</th>
                    <th className="px-2 py-1.5 text-right">Cena zakupu</th>
                    <th className="px-2 py-1.5 text-right">Wartość</th>
                    <th className="px-2 py-1.5 text-center">Decyzja zwrotu</th>
                    <th className="px-2 py-1.5">Źródłowy RMZ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        Brak pozycji na dokumencie.
                      </td>
                    </tr>
                  ) : (
                    detail.items.map((it) => {
                      const qty = Number(it.received_quantity) || Number(it.quantity) || 0;
                      const name = (it.product_name || "").trim() || "—";
                      const sku = (it.product_sku || "").trim() || "—";
                      const ean = (it.product_ean || "").trim() || "—";
                      const decision = (it.return_decision_label || "").trim() || "—";
                      const rmzId = it.source_rmz_id;
                      const rmzNum =
                        displayWarehouseDocumentNumber(it.source_rmz_number) || (it.source_rmz_number || "").trim();
                      return (
                        <tr key={it.id} className="hover:bg-slate-50/80">
                          <td className="max-w-[220px] px-2 py-1.5 font-medium text-slate-900">{name}</td>
                          <td className="px-2 py-1.5 font-mono text-xs text-slate-700">{sku}</td>
                          <td className="px-2 py-1.5 font-mono text-xs text-slate-700">{ean}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-900">{fmtQty(qty)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">
                            {fmtMoneyCur(it.purchase_price_net ?? null, currency)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-900">
                            {fmtMoneyCur(it.value_net, currency)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {decision !== "—" ? (
                              <span className="inline-flex h-6 items-center justify-center rounded border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-800">
                                {decision}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {rmzId != null && rmzId > 0 ? (
                              <Link
                                to={`/wms/returns/process/${rmzId}`}
                                className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
                              >
                                {rmzNum || `RMZ #${rmzId}`}
                              </Link>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
