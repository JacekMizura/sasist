import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { StockDocumentRead } from "../../api/stockDocumentsApi";
import { documentCreatedByLabel } from "../../utils/documentCreatedBy";
import { formatMoneyPl } from "../../utils/formatOrderMoney";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { ExternalStatusBadge } from "./documentsBadges";
import {
  WarehouseDocFinancialItem,
  warehouseDocDetailScrollClass,
} from "./warehouseDocumentDetailUi";
import type { BusinessDocStatus } from "./warehouseDocumentsUi";

function formatDateShort(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { dateStyle: "short" });
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

function HeaderMetaCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 truncate text-[12px] leading-tight">
      <span className="text-slate-500">{label} </span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
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
  for (const it of detail.items) {
    lineCount += 1;
    unitCount += Number(it.received_quantity) || Number(it.quantity) || 0;
  }

  const shellCls =
    layout === "page"
      ? "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"
      : "flex h-full min-h-0 flex-col overflow-hidden";

  const thCls =
    "px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500";
  const tdCls = "px-1.5 py-1 align-middle text-[13px]";

  return (
    <div className={shellCls}>
      <header className="max-h-[140px] shrink-0 overflow-hidden border-b border-slate-200 bg-white px-3 py-2">
        {backLink ? <div className="mb-1">{backLink}</div> : null}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-tight text-slate-900">
                Z-PZ {docNumber}
              </h1>
              <ExternalStatusBadge status={status} />
            </div>
            <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
              <HeaderMetaCell
                label="Magazyn:"
                value={
                  detail.warehouse_id == null
                    ? "—"
                    : (detail.warehouse_name || "").trim() || `#${detail.warehouse_id}`
                }
              />
              <HeaderMetaCell label="Autor:" value={documentCreatedByLabel(detail.created_by) || "—"} />
              <HeaderMetaCell
                label="Data:"
                value={<span className="tabular-nums">{formatDateShort(detail.created_at)}</span>}
              />
              <HeaderMetaCell
                label="Zamknięcie:"
                value={<span className="tabular-nums">{formatDateShort(detail.closed_at ?? null)}</span>}
              />
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              Pozycji: {lineCount} · Sztuk: {fmtQty(unitCount)} · Seria:{" "}
              {(detail.document_series_prefix || "Z-PZ").trim() || "Z-PZ"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right tabular-nums">
            <WarehouseDocFinancialItem compact label="Netto" value={fmtMoneyCur(detail.total_net, currency)} />
            <WarehouseDocFinancialItem compact label="VAT" value={fmtMoneyCur(detail.total_vat, currency)} />
            <WarehouseDocFinancialItem compact label="Brutto" value={fmtMoneyCur(detail.total_gross, currency)} />
          </div>
        </div>
      </header>

      {error ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-12 text-sm text-slate-500">Wczytywanie…</div>
        ) : (
          <div className={warehouseDocDetailScrollClass}>
            <div className="min-w-0 overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead className="sticky top-0 z-[1] bg-white shadow-[0_1px_0_0_rgb(241_245_249)]">
                <tr className="border-b border-slate-100">
                  <th className={thCls}>Produkt</th>
                  <th className={thCls}>SKU</th>
                  <th className={thCls}>EAN</th>
                  <th className={`${thCls} text-right`}>Ilość</th>
                  <th className={`${thCls} text-right`}>Cena zakupu</th>
                  <th className={`${thCls} text-right`}>Wartość</th>
                  <th className={`${thCls} text-center`}>Decyzja zwrotu</th>
                  <th className={thCls}>Źródłowy RMZ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
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
                      displayWarehouseDocumentNumber(it.source_rmz_number) ||
                      (it.source_rmz_number || "").trim();
                    return (
                      <tr key={it.id} className="h-11 max-h-12 transition-colors hover:bg-slate-50/40">
                        <td className={`${tdCls} max-w-[220px] font-medium text-slate-900`}>
                          <span className="line-clamp-2 leading-tight">{name}</span>
                        </td>
                        <td className={`${tdCls} font-mono text-[11px] text-slate-700`}>{sku}</td>
                        <td className={`${tdCls} font-mono text-[11px] text-slate-700`}>{ean}</td>
                        <td className={`${tdCls} text-right tabular-nums text-slate-900`}>{fmtQty(qty)}</td>
                        <td className={`${tdCls} text-right tabular-nums text-slate-800`}>
                          {fmtMoneyCur(it.purchase_price_net ?? null, currency)}
                        </td>
                        <td className={`${tdCls} text-right tabular-nums font-medium text-slate-900`}>
                          {fmtMoneyCur(it.value_net, currency)}
                        </td>
                        <td className={`${tdCls} text-center`}>
                          {decision !== "—" ? (
                            <span className="inline-flex h-6 items-center justify-center rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-semibold text-slate-800">
                              {decision}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={tdCls}>
                          {rmzId != null && rmzId > 0 ? (
                            <Link
                              to={`/wms/returns/process/${rmzId}`}
                              className="text-[12px] font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
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
