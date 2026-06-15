import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { PageContainer } from "../../components/layout/PageLayout";
import { ModuleListFiltersCard } from "../../components/listPage/ModuleListFiltersCard";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import { PurchaseOrdersListTable } from "./PurchaseOrdersListTable";
import api from "../../api/axios";
import {
  createDelivery,
  deleteDelivery,
  listDeliveries,
  supplierOrderPdfUrl,
  type DeliveryListRow,
  type DeliveryStatus,
} from "../../api/inboundDeliveriesApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { fetchPurchasingSupplierAnalytics } from "../../api/purchasingSupplierAnalyticsApi";
import { CreatePzFromDeliveryModal } from "./CreatePzFromDeliveryModal";
import { PurchaseOrderEditModal } from "./PurchaseOrderEditModal";
import { openPdfUrlInPrintViewer } from "../../utils/openPdfForBrowserPrint";
import {
  FilterField,
  FilterGrid,
  filterInputClass,
  filterSelectClass,
  filterToolbarBtnApply,
  filterToolbarBtnSecondary,
} from "../../components/filters";

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

type RaceGen = { gen: number; ref: MutableRefObject<number> };

type PurchaseOrdersPageProps = {
  /** When true (route `/goods-orders/new`), auto-create draft and open editor like sidebar „+”. */
  defaultCreateOpen?: boolean;
};

export default function PurchaseOrdersPage({ defaultCreateOpen = false }: PurchaseOrdersPageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const { warehouse } = useWarehouse();
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [rows, setRows] = useState<DeliveryListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [newSupplierId, setNewSupplierId] = useState(0);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [pzForDeliveryId, setPzForDeliveryId] = useState<number | null>(null);
  const [toastPz, setToastPz] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [printMenuOpenId, setPrintMenuOpenId] = useState<number | null>(null);
  const [scoreBySupplierId, setScoreBySupplierId] = useState<Record<number, number | null>>({});
  const plusRouteGen = useRef(0);
  /** One auto-create per `/goods-orders/new` visit (avoids re-running when `createDraftOrder` identity updates). */
  const plusBootstrapStartedRef = useRef(false);

  const [draftSearch, setDraftSearch] = useState("");
  const [draftSupplierId, setDraftSupplierId] = useState(0);
  const [draftStatus, setDraftStatus] = useState<"" | DeliveryStatus>("");
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");

  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedSupplierId, setAppliedSupplierId] = useState(0);
  const [appliedStatus, setAppliedStatus] = useState<"" | DeliveryStatus>("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [sup, list] = await Promise.all([
        listSuppliers(tenantId, { status: "all" }),
        listDeliveries(tenantId, {
          search: appliedSearch.trim() || undefined,
          supplier_id: appliedSupplierId >= 1 ? appliedSupplierId : undefined,
          status: appliedStatus || undefined,
          created_from: appliedDateFrom.trim() || undefined,
          created_to: appliedDateTo.trim() || undefined,
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
  }, [tenantId, appliedSearch, appliedSupplierId, appliedStatus, appliedDateFrom, appliedDateTo]);

  useEffect(() => {
    void load();
  }, [load]);

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
    if (suppliers.length > 0 && !suppliers.some((s) => s.id === newSupplierId)) {
      setNewSupplierId(suppliers[0].id);
    }
  }, [suppliers, newSupplierId]);

  useEffect(() => {
    api
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
    setEditId(id);
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const applyFilters = () => {
    setAppliedSearch(draftSearch);
    setAppliedSupplierId(draftSupplierId);
    setAppliedStatus(draftStatus);
    setAppliedDateFrom(draftDateFrom);
    setAppliedDateTo(draftDateTo);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftSearch("");
    setDraftSupplierId(0);
    setDraftStatus("");
    setDraftDateFrom("");
    setDraftDateTo("");
    setAppliedSearch("");
    setAppliedSupplierId(0);
    setAppliedStatus("");
    setAppliedDateFrom("");
    setAppliedDateTo("");
    setPage(1);
  };

  const createDraftOrder = useCallback(
    async (race?: RaceGen): Promise<void> => {
      if (suppliers.length === 0) {
        window.alert("Najpierw dodaj dostawcę (Asortyment → Dostawcy).");
        navigate("/suppliers");
        return;
      }
      const sid = newSupplierId || suppliers[0].id;
      if (!warehouse?.id) {
        window.alert("Wybierz magazyn w kontekście aplikacji, aby utworzyć dostawę.");
        return;
      }
      try {
        const d = await createDelivery({
          tenant_id: tenantId,
          supplier_id: sid,
          warehouse_id: warehouse.id,
          status: "draft",
        });
        if (race && race.gen !== race.ref.current) return;
        setEditId(d.id);
        setModalOpen(true);
        void load();
      } catch {
        if (race && race.gen !== race.ref.current) return;
        setErr("Nie udało się utworzyć szkicu.");
      }
    },
    [suppliers, newSupplierId, tenantId, warehouse?.id, navigate, load],
  );

  const createNew = () => void createDraftOrder();

  useEffect(() => {
    if (!defaultCreateOpen || loading) return;
    if (plusBootstrapStartedRef.current) return;
    plusBootstrapStartedRef.current = true;
    const gen = ++plusRouteGen.current;
    void createDraftOrder({ gen, ref: plusRouteGen });
  }, [defaultCreateOpen, loading, createDraftOrder]);

  const closeOrderModal = () => {
    setModalOpen(false);
    setEditId(null);
    if (defaultCreateOpen) {
      const q = new URLSearchParams(searchParams);
      q.set("tenant_id", String(tenantId));
      navigate({ pathname: "/goods-orders", search: `?${q.toString()}` }, { replace: true });
    }
  };

  const openRow = (id: number) => {
    setEditId(id);
    setModalOpen(true);
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
      if (editId === id) {
        setModalOpen(false);
        setEditId(null);
      }
      void load();
    } catch {
      setToastText("Błąd podczas usuwania zamówienia");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteConfirmId, tenantId, editId, load]);

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

      <PageContainer fullBleed omitCard className="max-w-none p-4 md:p-5">
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:space-y-4 md:p-5">
          <ListPageHeader
            title="Zamówienia towaru"
            breadcrumbs={[
              { label: "Asortyment", to: "/products/list" },
              { label: "Zamówienia towaru" },
            ]}
          />

          <div className="border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-6 lg:gap-3">
            {[
              { k: "Szkice", v: String(summary.openDrafts), sub: "otwarte" },
              { k: "Zamówione (mies.)", v: String(summary.orderedThisMonth), sub: "w tym miesiącu" },
              { k: "Netto (mies.)", v: `${fmtMoney(summary.netMonth)} zł`, sub: "wartość" },
              { k: "Brutto (mies.)", v: `${fmtMoney(summary.grossMonth)} zł`, sub: "wartość" },
              { k: "Top dostawca", v: summary.topName ?? "—", sub: "najczęściej w mies." },
              {
                k: "Śr. scoring",
                v: summary.avgScore != null ? summary.avgScore.toFixed(1) : "—",
                sub: "dostawcy (90 d.)",
              },
            ].map((c) => (
              <div key={c.k}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{c.k}</p>
                <p className="truncate text-lg font-bold tabular-nums text-slate-900">{c.v}</p>
                <p className="text-xs text-slate-500">{c.sub}</p>
              </div>
            ))}
          </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
          <ModuleListFiltersCard
            filterBodyClassName="space-y-2 border-t border-slate-100 pt-3"
            onClear={clearFilters}
            onApply={applyFilters}
            applyLabel="Filtruj"
            clearLabel="Wyczyść filtry"
          >
            <FilterGrid>
              <FilterField label="Szukaj">
                <input
                  type="search"
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                  placeholder="Nazwa zamówienia lub dostawca"
                  className={filterInputClass}
                />
              </FilterField>
              <FilterField label="Dostawca">
                <select
                  value={draftSupplierId || ""}
                  onChange={(e) => setDraftSupplierId(Number(e.target.value) || 0)}
                  className={filterSelectClass}
                >
                  <option value="">Wszyscy dostawcy</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Status">
                <select
                  value={draftStatus}
                  onChange={(e) => setDraftStatus((e.target.value || "") as "" | DeliveryStatus)}
                  className={filterSelectClass}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Data od">
                <input
                  type="date"
                  value={draftDateFrom}
                  onChange={(e) => setDraftDateFrom(e.target.value)}
                  className={filterInputClass}
                />
              </FilterField>
              <FilterField label="Data do">
                <input
                  type="date"
                  value={draftDateTo}
                  onChange={(e) => setDraftDateTo(e.target.value)}
                  className={filterInputClass}
                />
              </FilterField>
              <FilterField label="Podmiot">
                <select
                  value={tenantId}
                  onChange={(e) => {
                    setTenantId(Number(e.target.value));
                    setPage(1);
                  }}
                  className={filterSelectClass}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Dostawca (nowe)">
                <select
                  value={newSupplierId || ""}
                  onChange={(e) => setNewSupplierId(Number(e.target.value))}
                  className={filterSelectClass}
                  disabled={suppliers.length === 0}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            </FilterGrid>
            <div className="flex justify-end gap-2 sm:hidden">
              <button type="button" onClick={clearFilters} className={filterToolbarBtnSecondary}>
                Wyczyść filtry
              </button>
              <button type="button" onClick={applyFilters} className={filterToolbarBtnApply}>
                Filtruj
              </button>
            </div>
          </ModuleListFiltersCard>
          </div>

          {err ? <p className="border-t border-slate-100 pt-4 text-sm text-red-600">{err}</p> : null}
          {loading ? (
            <p className="border-t border-slate-100 pt-4 text-slate-500">Ładowanie…</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-4 border-t border-slate-100 py-8 text-center text-sm text-slate-600">
              {appliedSearch.trim() || appliedSupplierId >= 1 || appliedStatus || appliedDateFrom || appliedDateTo ? (
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
            <div className="min-w-0 border-t border-slate-100 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-slate-200 bg-slate-50/80 px-3 py-2 md:px-4">
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
              <div className="flex flex-col gap-2 bg-slate-50/95 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
        )}
        </div>
      </PageContainer>

      {editId != null ? (
        <PurchaseOrderEditModal
          open={modalOpen}
          tenantId={tenantId}
          orderId={editId}
          suppliers={suppliers}
          onClose={closeOrderModal}
          onSaved={() => void load()}
        />
      ) : null}

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
