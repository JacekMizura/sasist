import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { listPurchaseOrders, type PurchaseOrderListRow } from "../../api/purchasingOrdersApi";
import { AppEmptyState } from "../../components/app-shell";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import { usePurchasingModuleContextOptional } from "../../modules/purchasing/context/PurchasingModuleContext";
import { usePurchasingTenant } from "../../modules/purchasing/hooks/usePurchasingTenant";
import {
  PurchasingContentArea,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingStatusBadge,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingBtnGhost,
  purchasingLinkClass,
  purchasingTableTdClass,
  purchasingTableThClass,
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
  const [toast, setToast] = useState<string | null>(() => {
    try {
      const t = sessionStorage.getItem(PO_TOAST_KEY);
      if (t) {
        sessionStorage.removeItem(PO_TOAST_KEY);
        return t;
      }
    } catch {
      /* ignore */
    }
    return null;
  });

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
  const td = purchasingTableTdClass;
  const tenantQuery = useMemo(() => `tenant_id=${tenantId}`, [tenantId]);

  return (
    <PurchasingContentArea>
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title="Zamówienia zakupowe"
            subtitle="Szkice i zamówienia wysłane do dostawców."
          />
        }
        status={
          <>
            {toast ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{toast}</div>
            ) : null}
            {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div> : null}
            {!moduleCtx ? (
              <p className="text-xs text-slate-500">Wybierz podmiot w pasku modułu.</p>
            ) : null}
            {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}
          </>
        }
        table={
          !loading ? (
            <PurchasingTableSection
              title="Lista zamówień"
              subtitle={`Strona ${page} / ${totalPages} · ${total} łącznie`}
              indicatorClass="bg-blue-500"
              action={
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    className={purchasingBtnGhost}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Poprzednia
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    className={purchasingBtnGhost}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Następna
                  </button>
                </div>
              }
              toolbar={
                <div className="flex justify-end">
                  <DataTablePageSizeSelect
                    value={pageSize}
                    onChange={(next) => {
                      setPageSize(next);
                      setPage(1);
                    }}
                  />
                </div>
              }
            >
              {rows.length === 0 ? (
                <AppEmptyState
                  icon={ShoppingCart}
                  title="Brak zamówień zakupowych"
                  description="Użyj generatora uzupełnień, aby utworzyć pierwsze zamówienie."
                  density="inline"
                  action={
                    <Link to={`/purchasing/replenishment?tenant_id=${tenantId}`} className={purchasingLinkClass}>
                      Przejdź do generatora
                    </Link>
                  }
                />
              ) : (
                <table className="w-full min-w-[900px] text-left text-sm">
                  <PurchasingTableHeader>
                    <tr>
                      <th className={`${purchasingTableThClass} text-left`}>Numer</th>
                      <th className={`${purchasingTableThClass} text-left`}>Dostawca</th>
                      <th className={`${purchasingTableThClass} text-left`}>Utworzono</th>
                      <th className={`${purchasingTableThClass} text-left`}>Oczekiwana</th>
                      <th className={`${purchasingTableThClass} text-center`}>Pozycje</th>
                      <th className={`${purchasingTableThClass} text-right`}>Razem</th>
                      <th className={`${purchasingTableThClass} text-center`}>Status</th>
                      <th className={`${purchasingTableThClass} text-right`}>Akcje</th>
                    </tr>
                  </PurchasingTableHeader>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
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
                            className={purchasingLinkClass}
                          >
                            Otwórz
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PurchasingTableSection>
          ) : null
        }
      />
    </PurchasingContentArea>
  );
}
