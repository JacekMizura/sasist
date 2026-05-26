import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { listPurchaseOrders, type PurchaseOrderListRow } from "../../api/purchasingOrdersApi";
import { DataTablePageSizeSelect } from "../../components/table/DataTablePageSizeSelect";
import { fmtDate, STATUS_LABEL, statusBadgeClass } from "./purchasingPoCommon";

type Tenant = { id: number; name: string };

const PO_TOAST_KEY = "purchasing_po_toast";
const PO_PAGE_SIZE_KEY = "purchase_orders.pageSize";

function initialTenantIdFromSearchParams(sp: URLSearchParams): number {
  const tid = sp.get("tenant_id");
  if (tid != null && tid !== "") {
    const n = Number(tid);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return 1;
}

export default function PurchasingPoPage() {
  const [searchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(() => initialTenantIdFromSearchParams(searchParams));
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
    void api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length === 0) return;
        setTenantId((prev) => (list.some((t) => t.id === prev) ? prev : list[0].id));
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantId(n);
    }
  }, [searchParams]);

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
  }, [loadList]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const th = "py-3 px-3 text-left text-xs font-semibold text-slate-800 whitespace-nowrap";
  const td = "py-3 px-3 text-sm text-slate-800";

  const tenantQuery = useMemo(() => `tenant_id=${tenantId}`, [tenantId]);

  return (
    <>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Zamówienia zakupowe</h1>
          </div>

          {toast ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{toast}</div>
          ) : null}
          {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div> : null}

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Podmiot</label>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            value={tenantId}
            onChange={(e) => {
              setTenantId(Number(e.target.value));
              setPage(1);
            }}
          >
            {tenants.length === 0 ? (
              <option value={tenantId}>#{tenantId}</option>
            ) : (
              tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            )}
          </select>
        </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Ładowanie…</p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <DataTablePageSizeSelect
                  value={pageSize}
                  onChange={(next) => {
                    setPageSize(next);
                    setPage(1);
                  }}
                />
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="border-b border-slate-200 bg-slate-50/80">
              <tr>
                <th className={th}>Numer</th>
                <th className={th}>Dostawca</th>
                <th className={th}>Utworzono</th>
                <th className={th}>Oczekiwana</th>
                <th className={`${th} text-right`}>Pozycje</th>
                <th className={`${th} text-right`}>Razem</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    Brak zamówień zakupowych. Użyj generatora, aby je utworzyć.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className={`${td} font-medium`}>{r.order_number}</td>
                    <td className={td}>{r.supplier_name}</td>
                    <td className={`${td} text-slate-600`}>{fmtDate(r.created_at)}</td>
                    <td className={`${td} text-slate-600`}>{fmtDate(r.expected_date)}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.item_count}</td>
                    <td className={`${td} text-right tabular-nums font-medium`}>
                      {r.total_value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.currency}
                    </td>
                    <td className={td}>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(r.status)}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      <Link
                        to={`/purchasing/orders/${r.id}?${tenantQuery}`}
                        className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
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
            </div>
          )}

          {!loading && total > 0 ? (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                Strona {page} / {totalPages} ({total} łącznie)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Poprzednia
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Następna
                </button>
              </div>
            </div>
          ) : null}
    </>
  );
}
