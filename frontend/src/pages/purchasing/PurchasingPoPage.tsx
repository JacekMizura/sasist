import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, ShoppingCart } from "lucide-react";
import { listPurchaseOrders, type PurchaseOrderListRow } from "../../api/purchasingOrdersApi";
import { AppEmptyState } from "../../components/app-shell";
import {
  moduleListRowClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import { OperationalActionLink } from "../../components/operational";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import { GhostButton } from "../../design-system";
import { usePurchasingModuleContextOptional } from "../../modules/purchasing/context/PurchasingModuleContext";
import { usePurchasingTenant } from "../../modules/purchasing/hooks/usePurchasingTenant";
import {
  PurchasingContentArea,
  PurchasingPageShell,
  PurchasingStatusBadge,
  PurchasingTableSection,
  purchasingLinkClass,
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
  const tenantQuery = useMemo(() => `tenant_id=${tenantId}`, [tenantId]);

  return (
    <PurchasingContentArea>
      <PurchasingPageShell
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
                  <GhostButton type="button" density="compact" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Poprzednia
                  </GhostButton>
                  <GhostButton
                    type="button"
                    density="compact"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Następna
                  </GhostButton>
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
                  title="Brak zamówień do dostawców"
                  description="Użyj generatora uzupełnień, aby utworzyć pierwsze zamówienie."
                  density="inline"
                  action={
                    <Link to={`/purchasing/plan?tenant_id=${tenantId}`} className={purchasingLinkClass}>
                      Przejdź do generatora
                    </Link>
                  }
                />
              ) : (
                <>
                  <div className={moduleListTableScrollClass}>
                    <table className={`${moduleListTableClass} min-w-[900px]`}>
                      <thead className={moduleListTheadClass}>
                        <tr>
                          <th className={`${moduleListThClass} text-left`}>Numer</th>
                          <th className={`${moduleListThClass} text-left`}>Dostawca</th>
                          <th className={`${moduleListThClass} text-left`}>Utworzono</th>
                          <th className={`${moduleListThClass} text-left`}>Oczekiwana</th>
                          <th className={`${moduleListThClass} text-center`}>Pozycje</th>
                          <th className={`${moduleListThClass} text-right`}>Razem</th>
                          <th className={`${moduleListThClass} text-center`}>Status</th>
                          <th className={`${moduleListThClass} text-right`}>Akcje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className={moduleListRowClass}>
                            <td className={`${moduleListTdClass} font-medium text-slate-900`}>{r.order_number}</td>
                            <td className={`${moduleListTdClass} text-slate-800`}>{r.supplier_name}</td>
                            <td className={`${moduleListTdClass} text-slate-500`}>{fmtDate(r.created_at)}</td>
                            <td className={`${moduleListTdClass} text-slate-500`}>{fmtDate(r.expected_date)}</td>
                            <td className={`${moduleListTdClass} text-center tabular-nums`}>{r.item_count}</td>
                            <td className={`${moduleListTdClass} text-right font-medium tabular-nums`}>
                              {r.total_value.toLocaleString("pl-PL", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              {r.currency}
                            </td>
                            <td className={`${moduleListTdClass} text-center`}>
                              <PurchasingStatusBadge status={r.status} variant="po" />
                            </td>
                            <td className={`${moduleListTdClass} text-right`}>
                              <div className="flex justify-end">
                                <OperationalActionLink
                                  to={`/purchasing/orders/${r.id}?${tenantQuery}`}
                                  title="Otwórz zamówienie"
                                  aria-label="Otwórz zamówienie"
                                >
                                  <Eye strokeWidth={2} aria-hidden />
                                </OperationalActionLink>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className={moduleTablePaginationFooterClass}>
                    <span className="text-sm text-slate-600">
                      Strona {page} / {totalPages} · {total} łącznie
                    </span>
                  </div>
                </>
              )}
            </PurchasingTableSection>
          ) : null
        }
      />
    </PurchasingContentArea>
  );
}
