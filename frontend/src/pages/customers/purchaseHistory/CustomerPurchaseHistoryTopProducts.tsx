import { Link } from "react-router-dom";
import type { TopProductRow } from "../../../api/customerPurchaseHistoryApi";
import { formatMoneyPl } from "../../../utils/formatOrderMoney";
import { DocumentsTableCard } from "../../documents/documentsDashboardPrimitives";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL");
}

export function CustomerPurchaseHistoryTopProducts({
  items,
  loading,
}: {
  items: TopProductRow[];
  loading: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold text-slate-800">Najczęściej kupowane produkty</h2>
      <DocumentsTableCard>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-white">
              <tr>
                {["Produkt", "EAN", "SKU", "Zakupy", "Ilość", "Obrót brutto", "Ostatni zakup"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-slate-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                    Ładowanie…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                    Brak danych o produktach.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.product_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-2">
                      <Link to={row.detail_path} className="flex min-w-0 items-center gap-2 hover:underline">
                        {row.image_url ? (
                          <img src={row.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-contain" />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-50 text-xs text-slate-400">
                            ?
                          </span>
                        )}
                        <span className="min-w-0 truncate font-medium text-blue-700">{row.name}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.ean ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.sku ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-900">{row.purchase_count}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-900">{row.total_quantity}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums font-medium text-slate-900">
                      {formatMoneyPl(row.total_gross)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{fmtDate(row.last_purchased_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DocumentsTableCard>
    </section>
  );
}
