import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { StockDocumentRead } from "../../api/stockDocumentsApi";
import { formatMoneyPl } from "../../utils/formatOrderMoney";
import { documentCreatedByLabel } from "../../utils/documentCreatedBy";
import { ExternalStatusBadge } from "./documentsBadges";
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

type MetaItem = { label: string; value: ReactNode };

function MetaGrid({ items }: { items: MetaItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type Props = {
  detail: StockDocumentRead;
  status: BusinessDocStatus;
  loading?: boolean;
  error?: string | null;
};

export function WarehouseZPzDocumentDetail({ detail, status, loading, error }: Props) {
  const docNumber = (detail.document_number || "").trim() || `#${detail.id}`;
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

  const metaItems: MetaItem[] = [
    {
      label: "Magazyn",
      value: detail.warehouse_id == null ? "—" : (detail.warehouse_name || "").trim() || `#${detail.warehouse_id}`,
    },
    {
      label: "Operator",
      value: documentCreatedByLabel(detail.created_by) || "—",
    },
    {
      label: "Data utworzenia",
      value: <span className="tabular-nums">{formatDt(detail.created_at)}</span>,
    },
    {
      label: "Data zamknięcia",
      value: <span className="tabular-nums">{formatDt(detail.closed_at ?? null)}</span>,
    },
    {
      label: "Liczba pozycji",
      value: <span className="tabular-nums">{lineCount}</span>,
    },
    {
      label: "Liczba sztuk",
      value: <span className="tabular-nums">{fmtQty(unitCount)}</span>,
    },
    {
      label: "Wartość dokumentu",
      value: <span className="tabular-nums font-semibold">{fmtMoneyCur(docValue, currency)}</span>,
    },
  ];

  return (
    <>
      <header className="shrink-0 border-b border-slate-200 bg-white px-6 pb-5 pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Zbiorczy dokument zwrotu</p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{docNumber}</h2>
          </div>
          <ExternalStatusBadge status={status} />
        </div>
        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <MetaGrid items={metaItems} />
        </div>
      </header>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500">Wczytywanie…</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-bold">Produkt</th>
                    <th className="px-4 py-3 font-bold">SKU</th>
                    <th className="px-4 py-3 font-bold">EAN</th>
                    <th className="px-4 py-3 font-bold text-right">Ilość</th>
                    <th className="px-4 py-3 font-bold text-right">Cena zakupu</th>
                    <th className="px-4 py-3 font-bold text-right">Wartość</th>
                    <th className="px-4 py-3 font-bold text-center">Decyzja</th>
                    <th className="px-4 py-3 font-bold">Źródłowy RMZ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
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
                      const rmzNum = (it.source_rmz_number || "").trim();
                      return (
                        <tr key={it.id} className="hover:bg-slate-50/80">
                          <td className="max-w-[220px] px-4 py-3 font-medium text-slate-900">{name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700">{sku}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700">{ean}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-900">{fmtQty(qty)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-800">
                            {fmtMoneyCur(it.purchase_price_net ?? null, currency)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                            {fmtMoneyCur(it.value_net, currency)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {decision !== "—" ? (
                              <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md bg-slate-100 px-2 text-xs font-bold text-slate-800">
                                {decision}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {rmzId != null && rmzId > 0 ? (
                              <Link
                                to={`/wms/returns/process/${rmzId}`}
                                className="font-semibold text-violet-700 underline decoration-violet-200 underline-offset-2 hover:text-violet-900"
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
    </>
  );
}
