import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import type { PurchaseHistoryDocumentRow } from "../../../api/customerPurchaseHistoryApi";
import { OrderListPanelStatusBadge } from "../../../components/orders/orderList/OrderListPanelStatusBadge";
import { formatMoneyPl } from "../../../utils/formatOrderMoney";
import { DocumentsTableCard, documentsTableTheadCls } from "../../documents/documentsDashboardPrimitives";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pl-PL");
}

function ProductThumb({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded object-contain" />;
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-50 text-[10px] font-semibold text-slate-400">
      ?
    </span>
  );
}

export function CustomerPurchaseHistoryDocumentsTable({
  rows,
  loading,
  page,
  pages,
  onPageChange,
}: {
  rows: PurchaseHistoryDocumentRow[];
  loading: boolean;
  page: number;
  pages: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800">Historia dokumentów</h2>
        {!loading ? (
          <span className="text-xs text-slate-500">{rows.length ? `Strona ${page} / ${pages}` : "Brak wyników"}</span>
        ) : null}
      </div>
      <DocumentsTableCard>
        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className={documentsTableTheadCls}>
              <tr>
                {[
                  "Lp.",
                  "Numer dokumentu",
                  "Data",
                  "Status",
                  "Produkty",
                  "Poz.",
                  "Netto",
                  "VAT",
                  "Brutto",
                  "Magazyn",
                  "Operator",
                  "Akcje",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-slate-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-sm text-slate-500">
                    Ładowanie…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-sm text-slate-500">
                    Brak dokumentów dla wybranych filtrów.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.order_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{row.lp}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                      <Link to={row.detail_path} className="text-blue-700 hover:underline">
                        {row.document_number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{fmtDate(row.order_date)}</td>
                    <td className="px-3 py-2">
                      <OrderListPanelStatusBadge
                        compact
                        status={{
                          id: row.status.id ?? 0,
                          name: row.status.name,
                          color: row.status.color,
                          main_group: row.status.main_group as "NEW" | "IN_PROGRESS" | "DONE",
                          group_name: null,
                          subgroup_name: null,
                          badge_color: null,
                          background_color: null,
                          text_color: null,
                          image_url: null,
                          is_active: true,
                        }}
                      />
                    </td>
                    <td className="min-w-[220px] px-3 py-2">
                      <div className="flex flex-col gap-1.5">
                        {row.products_preview.slice(0, 3).map((p, i) => (
                          <div key={`${row.order_id}-${i}`} className="flex min-w-0 items-center gap-2">
                            <ProductThumb url={p.image_url} name={p.name} />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-900">{p.name}</p>
                              <p className="truncate text-[11px] text-slate-500">
                                {[p.sku && `SKU: ${p.sku}`, p.ean && `EAN: ${p.ean}`].filter(Boolean).join(" · ") ||
                                  "—"}
                              </p>
                            </div>
                          </div>
                        ))}
                        {row.line_count > 3 ? (
                          <p className="text-[11px] text-slate-500">+ {row.line_count - 3} pozycji</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">{row.line_count}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-900">{formatMoneyPl(row.net)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">{formatMoneyPl(row.vat)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums font-medium text-slate-900">
                      {formatMoneyPl(row.gross)}
                    </td>
                    <td className="px-3 py-2">
                      {row.warehouse_name ? (
                        <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                          {row.warehouse_name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.operator_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={row.detail_path}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Otwórz
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DocumentsTableCard>
      {pages > 1 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-40"
          >
            Poprzednia
          </button>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-40"
          >
            Następna
          </button>
        </div>
      ) : null}
    </section>
  );
}
