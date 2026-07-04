import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Award, Banknote, FileText, Receipt, ShoppingCart, Star } from "lucide-react";
import PageLayout from "../../components/layout/PageLayout";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import { moduleTableCardClass, moduleTablePaginationFooterClass } from "../../components/listPage/moduleList";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { PurchaseOrdersListTable } from "./PurchaseOrdersListTable";
import api from "../../api/axios";
import {
  deleteDelivery,
  listDeliveries,
  supplierOrderPdfUrl,
  type DeliveryListRow,
  type DeliveryStatus,
} from "../../api/inboundDeliveriesApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { fetchPurchasingSupplierAnalytics } from "../../api/purchasingSupplierAnalyticsApi";
import { CreatePzFromDeliveryModal } from "./CreatePzFromDeliveryModal";
import { openPdfUrlInPrintViewer } from "../../utils/openPdfForBrowserPrint";
import { FilterApplyActions } from "../../components/filters";
import {
  buildPurchaseOrderListViewAdapter,
  listViewActionsFromHook,
  useListViewState,
} from "../../preferences/listView";
import {
  PurchasingFilterBar,
  PurchasingFilterField,
  PurchasingKpiCard,
  PurchasingKpiGrid,
  purchasingInputClass,
  purchasingSelectClass,
} from "../../modules/purchasing/ui";

type Tenant = { id: number; name: string };

const STATUS_OPTIONS: { value: "" | DeliveryStatus; label: string }[] = [
  { value: "", label: "Wszystkie statusy" },
  { value: "draft", label: "Szkic" },
  { value: "ordered", label: "Zamówione" },
  { value: "in_transit", label: "W drodze" },
  { value: "received", label: "Dostarczone" },
  { value: "cancelled", label: "Anulowane" },
];

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function inRange(iso: string | null | undefined, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const listViewAdapter = useMemo(() => buildPurchaseOrderListViewAdapter(tenantId), [tenantId]);
  const listView = useListViewState(listViewAdapter);
  const listViewActions = useMemo(() => listViewActionsFromHook(listView), [listView]);
  const {
    isHydrated,
    draftFilters,
    setDraftFilters,
    appliedFilters,
    applyFilters,
    clearFilters,
    page,
    setPage,
    pageSize: rowsPerPage,
    setPageSize: setRowsPerPage,
  } = listView;
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [rows, setRows] = useState<DeliveryListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pzForDeliveryId, setPzForDeliveryId] = useState<number | null>(null);
  const [toastPz, setToastPz] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [printMenuOpenId, setPrintMenuOpenId] = useState<number | null>(null);
  const [scoreBySupplierId, setScoreBySupplierId] = useState<Record<number, number | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [sup, list] = await Promise.all([
        listSuppliers(tenantId, { status: "all" }),
        listDeliveries(tenantId, {
          search: appliedFilters.search.trim() || undefined,
          supplier_id: appliedFilters.supplierId >= 1 ? appliedFilters.supplierId : undefined,
          status: appliedFilters.status || undefined,
          created_from: appliedFilters.dateFrom.trim() || undefined,
          created_to: appliedFilters.dateTo.trim() || undefined,
        }),
      ]);
      setSuppliers(sup);
      setRows(list);
    } catch {
      setErr("Nie udało się wczytać listy.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, appliedFilters]);

  useEffect(() => {
    if (!isHydrated) return;
    void load();
  }, [load, isHydrated]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await fetchPurchasingSupplierAnalytics({
          tenantId,
          supplierId: null,
          rangeDays: 90,
        });
        if (cancelled) return;
        const m: Record<number, number | null> = {};
        for (const r of payload.rows ?? []) {
          m[r.supplier_id] = r.score;
        }
        setScoreBySupplierId(m);
      } catch {
        if (!cancelled) setScoreBySupplierId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    void api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
      })
      .catch(() => setTenants([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toastPz) return;
    const t = window.setTimeout(() => setToastPz(null), 5000);
    return () => window.clearTimeout(t);
  }, [toastPz]);

  useEffect(() => {
    if (!toastText) return;
    const t = window.setTimeout(() => setToastText(null), 4000);
    return () => window.clearTimeout(t);
  }, [toastText]);

  useEffect(() => {
    if (printMenuOpenId == null) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest("[data-print-menu-root]")) return;
      setPrintMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [printMenuOpenId]);

  useEffect(() => {
    const rawTid = searchParams.get("tenant_id");
    if (rawTid == null || rawTid === "") return;
    const tid = Number(rawTid);
    if (!Number.isFinite(tid) || tid < 1) return;
    setTenantId((prev) => (prev === tid ? prev : tid));
  }, [searchParams]);

  useEffect(() => {
    const e = searchParams.get("edit");
    if (e == null || e === "") return;
    const id = Number(e);
    if (!Number.isFinite(id) || id < 1) return;
    const tid = searchParams.get("tenant_id");
    void navigate(`/goods-orders/${id}${tid ? `?tenant_id=${tid}` : ""}`, { replace: true });
  }, [searchParams, navigate]);

  const openRow = (id: number) => {
    void navigate(`/goods-orders/${id}?tenant_id=${tenantId}`);
  };

  const openSupplierOrderPdf = (orderId: number) => {
    openPdfUrlInPrintViewer(supplierOrderPdfUrl(tenantId, orderId));
  };

  const printSupplierOrderPdf = (orderId: number) => {
    openPdfUrlInPrintViewer(supplierOrderPdfUrl(tenantId, orderId), {
      autoPrint: true,
      autoPrintDelayMs: 1000,
    });
  };

  const confirmDeleteOrder = useCallback(async () => {
    if (deleteConfirmId == null) return;
    const id = deleteConfirmId;
    setDeleteBusy(true);
    try {
      await deleteDelivery(tenantId, id);
      setDeleteConfirmId(null);
      setRows((prev) => prev.filter((r) => r.id !== id));
      void load();
    } catch {
      setToastText("Błąd podczas usuwania zamówienia");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteConfirmId, tenantId, load]);

  const formatDt = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const fmtMoney = (n: number) =>
    n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const { start: monthStart, end: monthEnd } = useMemo(() => monthBounds(), []);

  const summary = useMemo(() => {
    const openDrafts = rows.filter((r) => r.status === "draft").length;
    const monthRows = rows.filter((r) => inRange(r.created_at, monthStart, monthEnd));
    const orderedThisMonth = monthRows.filter((r) => r.status !== "draft" && r.status !== "cancelled").length;
    let netMonth = 0;
    let grossMonth = 0;
    const supplierCounts: Record<number, number> = {};
    for (const r of monthRows) {
      netMonth += Number(r.total_net ?? r.total_value ?? 0);
      grossMonth += Number(r.total_gross ?? r.total_net ?? r.total_value ?? 0);
      if (r.supplier_id) supplierCounts[r.supplier_id] = (supplierCounts[r.supplier_id] ?? 0) + 1;
    }
    let topSid: number | null = null;
    let topN = 0;
    for (const [sid, c] of Object.entries(supplierCounts)) {
      if (c > topN) {
        topN = c;
        topSid = Number(sid);
      }
    }
    const topName =
      topSid != null ? (rows.find((r) => r.supplier_id === topSid)?.supplier_name ?? null) : null;
    const scores = monthRows.map((r) => scoreBySupplierId[r.supplier_id]).filter((s): s is number => s != null && Number.isFinite(s));
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return {
      openDrafts,
      orderedThisMonth,
      netMonth,
      grossMonth,
      topName,
      avgScore,
    };
  }, [rows, monthStart, monthEnd, scoreBySupplierId]);

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const displayRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);
  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

  return (
    <>
      {toastPz ? (
        <div
          className="fixed bottom-6 left-1/2 z-[300] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-950 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="status"
        >
          {toastPz}
        </div>
      ) : toastText ? (
        <div
          className="fixed bottom-6 left-1/2 z-[400] max-w-md -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="status"
        >
          {toastText}
        </div>
      ) : null}

      <PageLayout fullBleed>
        <div className="space-y-6">
          <ListPageHeader
            title="Zamówienia towaru"
            breadcrumbs={[
              { label: "Asortyment", to: "/products/list" },
              { label: "Zamówienia towaru" },
            ]}
          />

          <PurchasingKpiGrid columns={6}>
            <PurchasingKpiCard
              title="Szkice"
              value={summary.openDrafts}
              subtitle="Otwarte szkice zamówień"
              tone="default"
              icon={<FileText aria-hidden />}
            />
            <PurchasingKpiCard
              title="Zamówione (mies.)"
              value={summary.orderedThisMonth}
              subtitle="W bieżącym miesiącu"
              tone="blue"
              icon={<ShoppingCart aria-hidden />}
            />
            <PurchasingKpiCard
              title="Netto (mies.)"
              value={`${fmtMoney(summary.netMonth)} zł`}
              subtitle="Wartość netto w miesiącu"
              tone="emerald"
              icon={<Banknote aria-hidden />}
            />
            <PurchasingKpiCard
              title="Brutto (mies.)"
              value={`${fmtMoney(summary.grossMonth)} zł`}
              subtitle="Wartość brutto w miesiącu"
              tone="indigo"
              icon={<Receipt aria-hidden />}
            />
            <PurchasingKpiCard
              title="Top dostawca"
              value={summary.topName ?? "—"}
              subtitle="Najczęściej w bieżącym miesiącu"
              tone="purple"
              icon={<Award aria-hidden />}
            />
            <PurchasingKpiCard
              title="Śr. punktacja"
              value={summary.avgScore != null ? summary.avgScore.toFixed(1) : "—"}
              subtitle="Dostawcy z ostatnich 90 dni"
              tone="amber"
              icon={<Star aria-hidden />}
            />
          </PurchasingKpiGrid>

          <PurchasingFilterBar
            actions={
              <FilterApplyActions
                onClear={clearFilters}
                onApply={applyFilters}
                clearLabel="Wyczyść filtry"
                applyLabel="Filtruj"
                listView={listViewActions}
              />
            }
          >
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <PurchasingFilterField label="Szukaj" className="min-w-0">
                <input
                  type="search"
                  value={draftFilters.search}
                  onChange={(e) => setDraftFilters((d) => ({ ...d, search: e.target.value }))}
                  placeholder="Nazwa zamówienia lub dostawca"
                  className={purchasingInputClass}
                />
              </PurchasingFilterField>
              <PurchasingFilterField label="Dostawca" className="min-w-0">
                <select
                  value={draftFilters.supplierId || ""}
                  onChange={(e) =>
                    setDraftFilters((d) => ({ ...d, supplierId: Number(e.target.value) || 0 }))
                  }
                  className={purchasingSelectClass}
                >
                  <option value="">Wszyscy dostawcy</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </PurchasingFilterField>
              <PurchasingFilterField label="Status" className="min-w-0">
                <select
                  value={draftFilters.status}
                  onChange={(e) =>
                    setDraftFilters((d) => ({ ...d, status: (e.target.value || "") as "" | DeliveryStatus }))
                  }
                  className={purchasingSelectClass}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </PurchasingFilterField>
              <PurchasingFilterField label="Podmiot" className="min-w-0">
                <select
                  value={tenantId}
                  onChange={(e) => {
                    setTenantId(Number(e.target.value));
                    setPage(1);
                  }}
                  className={purchasingSelectClass}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </PurchasingFilterField>
              <PurchasingFilterField label="Data od" className="min-w-0">
                <input
                  type="date"
                  value={draftFilters.dateFrom}
                  onChange={(e) => setDraftFilters((d) => ({ ...d, dateFrom: e.target.value }))}
                  className={purchasingInputClass}
                />
              </PurchasingFilterField>
              <PurchasingFilterField label="Data do" className="min-w-0">
                <input
                  type="date"
                  value={draftFilters.dateTo}
                  onChange={(e) => setDraftFilters((d) => ({ ...d, dateTo: e.target.value }))}
                  className={purchasingInputClass}
                />
              </PurchasingFilterField>
            </div>
          </PurchasingFilterBar>

          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          {loading ? (
            <p className="text-sm text-slate-500">Ładowanie…</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center text-sm text-slate-600">
              {appliedFilters.search.trim() ||
              appliedFilters.supplierId >= 1 ||
              appliedFilters.status ||
              appliedFilters.dateFrom ||
              appliedFilters.dateTo ? (
                <p>Brak wyników dla filtrów.</p>
              ) : (
                <>
                  <p>Brak zamówień — dodaj zamówienie towaru z menu (+) lub poniżej.</p>
                  <Link
                    to={`/goods-orders/new?tenant_id=${tenantId}`}
                    className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                  >
                    Dodaj zamówienie towaru
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className={`${moduleTableCardClass} min-w-0`}>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-slate-100 px-4 py-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                    <span className="whitespace-nowrap">Wyników na stronę:</span>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setPage(1);
                      }}
                      className={`${listSellasistInputClass} !h-9 w-auto min-w-[4.5rem] py-0 pr-8 text-sm`}
                    >
                      {[25, 50, 100].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <PurchaseOrdersListTable
                rows={displayRows}
                scoreBySupplierId={scoreBySupplierId}
                printMenuOpenId={printMenuOpenId}
                onPrintMenuToggle={(id) => setPrintMenuOpenId(printMenuOpenId === id ? null : id)}
                onEdit={(id) => openRow(id)}
                onDeleteDraft={(id) => setDeleteConfirmId(id)}
                onToastCannotDelete={() => setToastText("Nie można usunąć zamówienia w tym statusie")}
                onPz={(id) => setPzForDeliveryId(id)}
                onPrintDirect={(id) => {
                  printSupplierOrderPdf(id);
                  setPrintMenuOpenId(null);
                }}
                onOpenPdf={(id) => {
                  openSupplierOrderPdf(id);
                  setPrintMenuOpenId(null);
                }}
                formatDt={formatDt}
                fmtMoney={fmtMoney}
              />
            {totalCount > 0 ? (
              <div className={`${moduleTablePaginationFooterClass} px-4`}>
                <span className="font-medium tabular-nums text-slate-600">
                  {startRow}–{endRow} z {totalCount}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                  >
                    Poprzednia
                  </button>
                  <span className="tabular-nums text-slate-600">
                    Strona {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                  >
                    Następna
                  </button>
                </div>
              </div>
            ) : null}
              </div>
            </div>
          )}
        </div>
      </PageLayout>

      {pzForDeliveryId != null ? (
        <CreatePzFromDeliveryModal
          open
          tenantId={tenantId}
          deliveryId={pzForDeliveryId}
          onClose={() => setPzForDeliveryId(null)}
          onSuccess={(msg) => {
            setToastPz(msg);
            void load();
          }}
        />
      ) : null}

      {deleteConfirmId != null ? (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-order-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="delete-order-title" className="text-lg font-bold text-slate-900">
              Usunąć zamówienie?
            </h3>
            <p className="mt-2 text-sm text-slate-600">Zamówienie zostanie trwale usunięte.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => {
                  if (!deleteBusy) setDeleteConfirmId(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void confirmDeleteOrder()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteBusy ? "Usuwanie…" : "Usuń"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
