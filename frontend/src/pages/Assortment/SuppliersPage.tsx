import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Download, TableProperties } from "lucide-react";

import api from "../../api/axios";
import { createDelivery } from "../../api/inboundDeliveriesApi";
import { deleteSupplier, listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { FilterVisibilityModal } from "../../components/filters";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../hooks/useActiveWarehouseContext";
import ExportModal from "../../components/exports/ExportModal";
import { SupplierListFiltersPanel } from "../../components/suppliers/supplierList/SupplierListFiltersPanel";
import { SuppliersListTable } from "../../components/suppliers/supplierList/SuppliersListTable";
import {
  SUPPLIER_LIST_COLUMN_CATALOG,
  SUPPLIER_LIST_DEFAULT_COLUMN_ORDER,
} from "../../components/suppliers/supplierList/supplierListColumnCatalog";
import {
  DEFAULT_APPLIED_SUPPLIER_LIST_FILTERS,
  countActiveSupplierFilters,
  supplierFilterToggleLabel,
  triStateToBool,
  type AppliedSupplierListFilters,
} from "../../components/suppliers/supplierList/supplierListFilterTypes";
import { useSupplierListColumnOrder } from "../../components/suppliers/supplierList/useSupplierListColumnOrder";
import {
  moduleTableCardClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import {
  listSellasistInputClass,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";

type Tenant = { id: number; name: string };

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

export default function SuppliersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<SupplierRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<AppliedSupplierListFilters>(
    DEFAULT_APPLIED_SUPPLIER_LIST_FILTERS,
  );
  const [appliedFilters, setAppliedFilters] = useState<AppliedSupplierListFilters>(
    DEFAULT_APPLIED_SUPPLIER_LIST_FILTERS,
  );
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem("suppliers.list.filtersExpanded") === "1";
    } catch {
      return false;
    }
  });
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [deleteBusy, setDeleteBusy] = useState<number | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const [toast, setToast] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [newOrderBusyId, setNewOrderBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const headerSelectAllRef = useRef<HTMLInputElement>(null);
  const { columnOrder, persistColumnOrder } = useSupplierListColumnOrder();

  const appliedFiltersKey = useMemo(() => JSON.stringify(appliedFilters), [appliedFilters]);
  const activeFilterCount = useMemo(() => countActiveSupplierFilters(appliedFilters), [appliedFilters]);

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
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
    const edit = searchParams.get("edit");
    if (edit == null || edit === "") return;
    const id = Number(edit);
    if (!Number.isFinite(id) || id < 1) return;
    const tid = searchParams.get("tenant_id");
    void navigate(`/suppliers/${id}${tid ? `?tenant_id=${tid}` : ""}`, { replace: true });
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const af = appliedFilters;
      const minProducts = af.minProductCount.trim() ? Number(af.minProductCount) : undefined;
      const minOrders = af.minOrderCount.trim() ? Number(af.minOrderCount) : undefined;
      setRows(
        await listSuppliers(tenantId, {
          name: af.name.trim() || undefined,
          status: af.status,
          country: af.country.trim() || undefined,
          city: af.city.trim() || undefined,
          email: af.email.trim() || undefined,
          phone: af.phone.trim() || undefined,
          currency: af.currency.trim() || undefined,
          requiresMoq: triStateToBool(af.requiresMoq),
          offersFreeShipping: triStateToBool(af.freeShipping),
          minProductCount: Number.isFinite(minProducts) ? minProducts : undefined,
          minDeliveryCount: Number.isFinite(minOrders) ? minOrders : undefined,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać dostawców.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
    setPage(1);
  }, [appliedFiltersKey, tenantId]);

  const openEdit = (id: number) => {
    void navigate(`/suppliers/${id}?tenant_id=${tenantId}`);
  };

  const openProducts = (id: number) => {
    void navigate(`/suppliers/${id}/products?tenant_id=${tenantId}`);
  };

  const applyFilters = () => setAppliedFilters(draftFilters);

  const clearFilters = () => {
    setDraftFilters(DEFAULT_APPLIED_SUPPLIER_LIST_FILTERS);
    setAppliedFilters(DEFAULT_APPLIED_SUPPLIER_LIST_FILTERS);
  };

  const toggleFiltersExpanded = () => {
    setFiltersExpanded((prev) => {
      const n = !prev;
      try {
        localStorage.setItem("suppliers.list.filtersExpanded", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const handleDelete = async (s: SupplierRead) => {
    const msg =
      s.delivery_count > 0
        ? `Dostawca ma ${s.delivery_count} zamówień. Zostanie dezaktywowany. Kontynuować?`
        : `Usunąć dostawcę „${s.name}”?`;
    if (!window.confirm(msg)) return;
    setDeleteBusy(s.id);
    try {
      const r = await deleteSupplier(tenantId, s.id);
      if ("deactivated" in r && r.deactivated) setToast("Dostawca ma zamówienia — oznaczony jako nieaktywny");
      void load();
    } catch {
      setToast("Operacja nie powiodła się.");
    } finally {
      setDeleteBusy(null);
    }
  };

  const handleNewSupplierOrder = async (supplierId: number) => {
    setNewOrderBusyId(supplierId);
    if (!hasActiveWarehouse || warehouseId == null) {
      setToast(ACTIVE_WAREHOUSE_REQUIRED_MESSAGE);
      setNewOrderBusyId(null);
      return;
    }
    try {
      const d = await createDelivery({
        tenant_id: tenantId,
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        status: "draft",
      });
      navigate(`/goods-orders?edit=${d.id}&tenant_id=${tenantId}`);
    } catch {
      setToast("Nie udało się utworzyć szkicu zamówienia do dostawcy.");
    } finally {
      setNewOrderBusyId(null);
    }
  };

  const goToOrders = (s: SupplierRead) => {
    navigate(`/suppliers/historia?tenant_id=${tenantId}&supplier_id=${s.id}`);
  };

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const pageRowIds = useMemo(() => paginatedRows.map((r) => r.id), [paginatedRows]);
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selected.has(id));
  const somePageSelected = pageRowIds.some((id) => selected.has(id));

  useLayoutEffect(() => {
    const el = headerSelectAllRef.current;
    if (el) el.indeterminate = somePageSelected && !allPageSelected;
  }, [somePageSelected, allPageSelected]);

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAllPage = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allPageSelected) pageRowIds.forEach((id) => n.delete(id));
      else pageRowIds.forEach((id) => n.add(id));
      return n;
    });
  };

  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);
  const selectedIds = useMemo(() => Array.from(selected).sort((a, b) => a - b), [selected]);
  const visibleIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [1];
    const max = 5;
    if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 3) return [1, 2, 3, 4, 5];
    if (page >= totalPages - 2) return Array.from({ length: 5 }, (_, i) => totalPages - 4 + i);
    return [page - 2, page - 1, page, page + 1, page + 2];
  }, [page, totalPages]);

  return (
    <>
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[300] max-w-md -translate-x-1/2 rounded-lg border border-slate-200 bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{loading ? "Ładowanie…" : `${totalCount} wyników`}</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={toggleFiltersExpanded}
              className={listSellasistToolbarToggleBtn}
              aria-expanded={filtersExpanded}
            >
              {filtersExpanded ? "Ukryj filtry" : supplierFilterToggleLabel(activeFilterCount)}
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            <button
              type="button"
              onClick={() => setColumnPickerOpen(true)}
              className={listSellasistToolbarSquareBtn}
              title="Widoczne pola"
              aria-label="Widoczne pola"
            >
              <TableProperties className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className={listSellasistToolbarSquareBtn}
              title="Eksport"
              aria-label="Eksport"
            >
              <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        <SupplierListFiltersPanel
          expanded={filtersExpanded}
          draft={draftFilters}
          onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
          onApply={applyFilters}
          onClear={clearFilters}
          tenants={tenants}
          tenantId={tenantId}
          onTenantChange={(id) => {
            setTenantId(id);
            setPage(1);
          }}
        />

        {err && !loading && rows.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</div>
        ) : null}

        {loading ? (
          <div className="space-y-2 py-8" aria-busy="true" aria-label="Ładowanie listy dostawców">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : err ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-amber-900">{err}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-800">Brak dostawców</p>
            <p className="mt-1 text-sm text-slate-500">Zmień filtry lub dodaj pierwszego dostawcę.</p>
          </div>
        ) : (
          <div className={`${moduleTableCardClass} min-w-0`}>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <SuppliersListTable
                rows={paginatedRows}
                columnOrder={columnOrder}
                selected={selected}
                deleteBusy={deleteBusy}
                newOrderBusyId={newOrderBusyId}
                allPageSelected={allPageSelected}
                headerSelectAllRef={headerSelectAllRef}
                onToggleOne={toggleOne}
                onToggleAllPage={toggleAllPage}
                onEdit={openEdit}
                onDelete={(s) => void handleDelete(s)}
                onNewOrder={(id) => void handleNewSupplierOrder(id)}
                onProductsClick={(s) => openProducts(s.id)}
                onOrdersClick={goToOrders}
              />
              <div className={`${moduleTablePaginationFooterClass} px-4`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium tabular-nums text-slate-600">
                    {startRow}–{endRow} z {totalCount}
                  </span>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    Na stronę
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setPage(1);
                      }}
                      className={`${listSellasistInputClass} !h-8 w-auto min-w-[4rem] py-0 pr-7 text-sm`}
                    >
                      {ROWS_PER_PAGE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                  >
                    Poprzednia
                  </button>
                  {pageNumbers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className={`min-w-[2rem] rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums ${
                        n === page ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-200/60"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
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
            </div>
          </div>
        )}
      </div>

      <FilterVisibilityModal
        open={columnPickerOpen}
        onClose={() => setColumnPickerOpen(false)}
        title="Kolumny listy dostawców"
        selectedColumnLabel="Widoczne"
        availableColumnLabel="Dostępne"
        selectedOrder={columnOrder}
        catalog={SUPPLIER_LIST_COLUMN_CATALOG}
        defaultVisibleOrder={SUPPLIER_LIST_DEFAULT_COLUMN_ORDER}
        onSave={persistColumnOrder}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={tenantId}
        entityType="suppliers"
        selectedIds={selectedIds.length > 0 ? selectedIds : []}
        fallbackIds={visibleIds}
      />
    </>
  );
}
