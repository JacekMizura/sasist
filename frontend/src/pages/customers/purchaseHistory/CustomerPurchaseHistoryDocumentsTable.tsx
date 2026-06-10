import { Link, useNavigate } from "react-router-dom";
import type { PurchaseHistoryDocumentRow } from "../../../api/customerPurchaseHistoryApi";
import { OrderListPanelStatusBadge } from "../../../components/orders/orderList/OrderListPanelStatusBadge";
import { formatMoneyPl } from "../../../utils/formatOrderMoney";
import { DocumentsTableCard, documentsTableTheadCls } from "../../documents/documentsDashboardPrimitives";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
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
  const navigate = useNavigate();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800">Dokumenty sprzedaży</h2>
        {!loading ? (
          <span className="text-xs text-slate-500">{rows.length ? `Strona ${page} / ${pages}` : "Brak wyników"}</span>
        ) : null}
      </div>
      <DocumentsTableCard>
        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className={documentsTableTheadCls}>
              <tr>
                {["Lp.", "Numer", "Typ", "Data", "Status", "Netto", "VAT", "Brutto"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-slate-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                    Ładowanie…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                    Brak dokumentów dla wybranych filtrów.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.order_id}
                    className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50/80"
                    onClick={() => navigate(row.detail_path)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(row.detail_path);
                    }}
                    tabIndex={0}
                    role="link"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">{row.lp}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Link
                        to={row.detail_path}
                        className="font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.document_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {row.order_channel ? (
                        <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {row.order_channel}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{fmtDate(row.order_date)}</td>
                    <td className="px-3 py-2.5">
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
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-900">{formatMoneyPl(row.net)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{formatMoneyPl(row.vat)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums font-semibold text-slate-900">
                      {formatMoneyPl(row.gross)}
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
