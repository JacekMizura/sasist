import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listPurchaseOrders, type PurchaseOrderListRow } from "../../api/purchasingOrdersApi";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import { usePurchasingModuleContextOptional } from "../../modules/purchasing/context/PurchasingModuleContext";
import { usePurchasingTenant } from "../../modules/purchasing/hooks/usePurchasingTenant";
import {
  PurchasingContentArea,
  PurchasingDataPanel,
  PurchasingPageHeader,
  PurchasingStatusBadge,
  PurchasingTableHeader,
} from "../../modules/purchasing/ui";
import { fmtDate } from "./purchasingPoCommon";

const PO_TOAST_KEY = "purchasing_po_toast";
const PO_PAGE_SIZE_KEY = "purchase_orders.pageSize";

export default function PurchasingPoPage() {
  const moduleCtx = usePurchasingModuleContextOptional();
  const { tenantId, refreshSignal } = usePurchasingTenant();
  const [rows, setRows] = useState<PurchaseOrderListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const raw = localStorage.getItem(PO_PAGE_SIZE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 25;
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const msg = sessionStorage.getItem(PO_TOAST_KEY);
    if (msg) {
      setToast(msg);
      sessionStorage.removeItem(PO_TOAST_KEY);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    localStorage.setItem(PO_PAGE_SIZE_KEY, String(pageSize));
  }, [pageSize]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await listPurchaseOrders({ tenant_id: tenantId, page, page_size: pageSize });
      setRows(res.rows);
      setTotal(res.total);
    } catch {
      setErr("Nie udało się wczytać zamówień zakupowych.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, pageSize]);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshSignal]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const td = "px-6 py-4 text-sm text-slate-800";
  const tenantQuery = useMemo(() => `tenant_id=${tenantId}`, [tenantId]);

  return (
    <PurchasingContentArea>
      <PurchasingPageHeader title="Zamówienia zakupowe" />

      {toast ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{toast}</div>
      ) : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div> : null}

      {!moduleCtx ? (
        <p className="text-xs text-slate-500">Wybierz podmiot w pasku modułu lub w filtrach dostawców.</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : (
        <PurchasingDataPanel
          title={`Strona ${page} / ${totalPages}`}
          subtitle={`(${total} łącznie)`}
          action={
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 disabled:text-slate-400"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Poprzednia
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                className="rounded border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 disabled:text-slate-400"
                onClick={() => setPage((p) => p + 1)}
              >
                Następna
              </button>
            </div>
          }
        >
          <div className="flex justify-end border-b border-slate-100 px-4 py-2">
            <DataTablePageSizeSelect
              value={pageSize}
              onChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <PurchasingTableHeader>
                <tr>
                  <th className="px-6 py-4 text-left">Numer</th>
                  <th className="px-6 py-4 text-left">Dostawca</th>
                  <th className="px-6 py-4 text-left">Utworzono</th>
                  <th className="px-6 py-4 text-left">Oczekiwana</th>
                  <th className="px-6 py-4 text-center">Pozycje</th>
                  <th className="px-6 py-4 text-right">Razem</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Akcje</th>
                </tr>
              </PurchasingTableHeader>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm italic text-slate-400">
                      Brak zamówień zakupowych. Użyj generatora, aby je utworzyć.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-blue-50/30">
                      <td className={`${td} font-medium`}>{r.order_number}</td>
                      <td className={td}>{r.supplier_name}</td>
                      <td className={`${td} text-slate-500`}>{fmtDate(r.created_at)}</td>
                      <td className={`${td} text-slate-500`}>{fmtDate(r.expected_date)}</td>
                      <td className={`${td} text-center tabular-nums`}>{r.item_count}</td>
                      <td className={`${td} text-right font-medium tabular-nums`}>
                        {r.total_value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        {r.currency}
                      </td>
                      <td className={`${td} text-center`}>
                        <PurchasingStatusBadge status={r.status} variant="po" />
                      </td>
                      <td className={`${td} text-right`}>
                        <Link
                          to={`/purchasing/orders/${r.id}?${tenantQuery}`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          Otwórz
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PurchasingDataPanel>
      )}
    </PurchasingContentArea>
  );
}
