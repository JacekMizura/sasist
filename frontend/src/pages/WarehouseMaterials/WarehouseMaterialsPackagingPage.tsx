import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, TableProperties } from "lucide-react";

import {
  bulkSetPackagingMaterialSupplier,
  deletePackagingMaterial,
  duplicatePackagingMaterial,
  getPackagingMaterials,
  type PackagingMaterialDto,
} from "../../api/packagingMaterialsApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { FilterVisibilityModal, useListColumnLayout } from "../../components/filters";
import { moduleTableCardClass, moduleTablePaginationFooterClass } from "../../components/listPage/moduleList";
import {
  listSellasistInputClass,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";
import { PackagingListFiltersPanel } from "../../components/warehouseMaterials/packagingList/PackagingListFiltersPanel";
import { PackagingListTable } from "../../components/warehouseMaterials/packagingList/PackagingListTable";
import {
  PACKAGING_LIST_COLUMN_CATALOG,
  PACKAGING_LIST_COLUMN_IDS,
  PACKAGING_LIST_DEFAULT_COLUMN_ORDER,
  PACKAGING_LIST_COLUMNS_LAYOUT_KEY,
} from "../../components/warehouseMaterials/packagingList/packagingListColumnCatalog";
import {
  countActivePackagingListFilters,
  packagingListFilterToggleLabel,
} from "../../components/warehouseMaterials/packagingList/packagingListFilterTypes";
import {
  buildPackagingListViewAdapter,
  listViewActionsFromHook,
  useListViewState,
} from "../../preferences/listView";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100] as const;

export default function WarehouseMaterialsPackagingPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;

  const listViewAdapter = useMemo(() => buildPackagingListViewAdapter(tenantId), [tenantId]);
  const listView = useListViewState(listViewAdapter);
  const listViewActions = useMemo(() => listViewActionsFromHook(listView), [listView]);
  const {
    isHydrated,
    draftFilters,
    setDraftFilters,
    appliedFilters,
    applyFilters,
    clearFilters,
    appliedFiltersKey,
    page,
    setPage,
    pageSize: rowsPerPage,
    setPageSize: setRowsPerPage,
    filtersExpanded,
    toggleFiltersPanel,
    columnOrder: listViewColumnOrder,
    persistColumnOrder: listViewPersistColumnOrder,
  } = listView;

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<PackagingMaterialDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkSupplierId, setBulkSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dupBusy, setDupBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const headerSelectAllRef = useRef<HTMLInputElement>(null);
  const { columnOrder, persistColumnOrder } = useListColumnLayout(
    PACKAGING_LIST_COLUMNS_LAYOUT_KEY,
    PACKAGING_LIST_COLUMN_IDS,
    PACKAGING_LIST_DEFAULT_COLUMN_ORDER,
    { order: listViewColumnOrder, onChange: listViewPersistColumnOrder },
  );

  const activeFilterCount = useMemo(() => countActivePackagingListFilters(appliedFilters), [appliedFilters]);

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(appliedFilters.search.trim()), 280);
    return () => window.clearTimeout(h);
  }, [appliedFilters.search]);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await getPackagingMaterials({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        material_type: appliedFilters.materialType || undefined,
        active_only: appliedFilters.status === "active",
        q: debouncedSearch || null,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setErr("Nie udało się wczytać materiałów pakowych.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, appliedFilters.status, appliedFilters.materialType, debouncedSearch]);

  useEffect(() => {
    if (!isHydrated) return;
    void load();
  }, [load, isHydrated]);

  useEffect(() => {
    void listSuppliers(DAMAGE_TENANT_ID, { status: "all" }).then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setBulkSupplierId("");
    setPage(1);
  }, [warehouseId, appliedFiltersKey]);

  const displayRows = useMemo(() => {
    let list = [...rows];
    if (appliedFilters.status === "inactive") list = list.filter((r) => !r.is_active);
    if (appliedFilters.supplierId) {
      const sid = Number(appliedFilters.supplierId);
      list = list.filter((r) => r.supplier_id === sid);
    }
    if (appliedFilters.lowStockOnly) {
      list = list.filter((r) => {
        const thr = r.low_stock_threshold;
        return thr != null && Number.isFinite(Number(thr)) && Number(r.stock) <= Number(thr);
      });
    }
    const sk = appliedFilters.sort;
    list.sort((a, b) => {
      if (sk === "stock") return Number(b.stock) - Number(a.stock);
      if (sk === "supplier") {
        return (a.supplier_name ?? "").localeCompare(b.supplier_name ?? "", "pl");
      }
      if (sk === "net") {
        const na = a.unit_net_price ?? -1;
        const nb = b.unit_net_price ?? -1;
        return Number(na) - Number(nb);
      }
      return a.name.localeCompare(b.name, "pl");
    });
    return list;
  }, [rows, appliedFilters]);

  const totalCount = displayRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return displayRows.slice(start, start + rowsPerPage);
  }, [displayRows, page, rowsPerPage]);

  const pageRowIds = useMemo(() => paginatedRows.map((r) => r.id), [paginatedRows]);
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selected.has(id));
  const somePageSelected = pageRowIds.some((id) => selected.has(id));

  useLayoutEffect(() => {
    const el = headerSelectAllRef.current;
    if (el) el.indeterminate = somePageSelected && !allPageSelected;
  }, [somePageSelected, allPageSelected]);

  const toggleFiltersExpanded = toggleFiltersPanel;

  const toggleOne = (id: string) => {
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

  const onDuplicate = async (row: PackagingMaterialDto) => {
    if (warehouseId == null) return;
    setDupBusy(row.id);
    setErr(null);
    try {
      const created = await duplicatePackagingMaterial(row.id, {
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
      });
      await load();
      navigate(`/warehouse-materials/packaging/${created.id}`);
    } catch {
      setErr("Nie udało się zduplikować materiału.");
    } finally {
      setDupBusy(null);
    }
  };

  const onDelete = async (row: PackagingMaterialDto) => {
    if (warehouseId == null) return;
    if (!window.confirm(`Usunąć materiał „${row.name}”?`)) return;
    setDeleteBusy(row.id);
    setErr(null);
    try {
      await deletePackagingMaterial(row.id, { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId });
      await load();
    } catch {
      setErr("Nie udało się usunąć.");
    } finally {
      setDeleteBusy(null);
    }
  };

  const applyBulkSupplier = async () => {
    if (warehouseId == null || selected.size === 0) return;
    const sid = bulkSupplierId.trim() ? parseInt(bulkSupplierId, 10) : NaN;
    if (!Number.isFinite(sid) || sid < 1) {
      window.alert("Wybierz dostawcę z listy.");
      return;
    }
    setBulkBusy(true);
    setErr(null);
    try {
      await bulkSetPackagingMaterialSupplier(
        { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId },
        { ids: [...selected], supplier_id: sid },
      );
      setSelected(new Set());
      await load();
    } catch {
      setErr("Nie udało się ustawić dostawcy dla zaznaczonych.");
    } finally {
      setBulkBusy(false);
    }
  };

  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [1];
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 3) return [1, 2, 3, 4, 5];
    if (page >= totalPages - 2) return Array.from({ length: 5 }, (_, i) => totalPages - 4 + i);
    return [page - 2, page - 1, page, page + 1, page + 2];
  }, [page, totalPages]);

  return (
    <>
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
              {filtersExpanded ? "Ukryj filtry" : packagingListFilterToggleLabel(activeFilterCount)}
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            <button
              type="button"
              onClick={() => setColumnPickerOpen(true)}
              className={listSellasistToolbarSquareBtn}
              title="Widoczne kolumny"
              aria-label="Widoczne kolumny"
            >
              <TableProperties className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </button>
            <Link
              to="/warehouse-materials/packaging/new"
              onClick={(e) => {
                if (warehouseId == null) e.preventDefault();
              }}
              className={`inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 ${warehouseId == null ? "pointer-events-none opacity-40" : ""}`}
            >
              Dodaj materiał pakowy
            </Link>
          </div>
        </div>

      <PackagingListFiltersPanel
        expanded={filtersExpanded}
        draft={draftFilters}
        suppliers={suppliers}
        onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
        onApply={applyFilters}
        onClear={clearFilters}
        listView={listViewActions}
      />

      {warehouseId == null ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          Wybierz magazyn w pasku u góry.
        </div>
      ) : null}

      {err ? <p className="mb-3 text-sm font-medium text-red-600">{err}</p> : null}

      {warehouseId != null && selected.size > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm">
          <span className="font-semibold text-violet-950">Zaznaczono: {selected.size}</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-800"
            value={bulkSupplierId}
            onChange={(e) => setBulkSupplierId(e.target.value)}
          >
            <option value="">— wybierz dostawcę —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void applyBulkSupplier()}
            className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
          >
            Ustaw dostawcę dla zaznaczonych
          </button>
          <button type="button" className="text-xs font-medium text-slate-600 underline" onClick={() => setSelected(new Set())}>
            Wyczyść zaznaczenie
          </button>
        </div>
      ) : null}

      {warehouseId == null ? null : loading ? (
        <div className="space-y-2 py-8" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-800">Brak materiałów pakowych</p>
          <p className="mt-1 text-sm text-slate-500">Dodaj pierwszy materiał lub zmień filtry.</p>
        </div>
      ) : (
        <div className={`${moduleTableCardClass} min-w-0`}>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <PackagingListTable
              rows={paginatedRows}
              columnOrder={columnOrder}
              selected={selected}
              deleteBusy={deleteBusy}
              dupBusy={dupBusy}
              allPageSelected={allPageSelected}
              headerSelectAllRef={headerSelectAllRef}
              onToggleOne={toggleOne}
              onToggleAllPage={toggleAllPage}
              onRowOpen={(id) => navigate(`/warehouse-materials/packaging/${id}`)}
              onEdit={(id) => navigate(`/warehouse-materials/packaging/${id}`)}
              onDuplicate={(row) => void onDuplicate(row)}
              onDelete={(row) => void onDelete(row)}
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
        title="Kolumny listy materiałów pakowych"
        selectedColumnLabel="Widoczne"
        availableColumnLabel="Dostępne"
        selectedOrder={columnOrder}
        catalog={PACKAGING_LIST_COLUMN_CATALOG}
        defaultVisibleOrder={PACKAGING_LIST_DEFAULT_COLUMN_ORDER}
        onSave={persistColumnOrder}
      />
    </>
  );
}
