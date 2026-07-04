import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Columns3, Download, Package } from "lucide-react";

import { AppEmptyState } from "../../components/app-shell";
import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import { PanelBulkStatusConfirmModal } from "../../components/orders/panelList/PanelBulkStatusConfirmModal";
import { UI_STRINGS } from "../../constants/uiStrings";
import { deleteBundle, listBundles, postBundlesBulkDelete, type BundleRead } from "../../api/bundlesApi";
import { summarizeEntityBulkDeleteToast } from "../../types/entityBulkDelete";
import ExportModal from "../../components/exports/ExportModal";
import { FilterVisibilityModal } from "../../components/filters";
import {
  BUNDLE_LIST_FILTER_CATALOG,
  BUNDLE_LIST_FILTER_IDS,
  BundlesListFiltersPanel,
} from "../../components/bundles/bundleList/BundlesListFiltersPanel";
import {
  buildBundleListViewAdapter,
  listViewActionsFromHook,
  useListViewState,
} from "../../preferences/listView";
import { BundlesListBulkBar } from "../../components/bundles/bundleList/BundlesListBulkBar";
import type { BundleMultiMenuActionId } from "../../components/bundles/bundleList/BundleListMultiActionsMenu";
import { BundlesListTable } from "../../components/bundles/bundleList/BundlesListTable";
import {
  bundleListFilterToggleLabel,
  countActiveBundleListFilters,
} from "../../components/bundles/bundleList/bundleListFilterTypes";
import {
  moduleTableCardClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import {
  listSellasistInputClass,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";
import type { PanelBulkSelectionMode } from "../../hooks/usePanelListBulkSelection";
import PageLayout from "../../components/layout/PageLayout";

const DEFAULT_TENANT_ID = 1;
const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

export default function BundlesPage() {
  const navigate = useNavigate();
  const listViewAdapter = useMemo(() => buildBundleListViewAdapter(DEFAULT_TENANT_ID), []);
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
    filterFieldOrder,
    setFilterFieldOrder,
  } = listView;
  const [bundles, setBundles] = useState<BundleRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [previewBundle, setPreviewBundle] = useState<BundleRead | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [filterFieldsOpen, setFilterFieldsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkMode, setBulkMode] = useState<PanelBulkSelectionMode>("none");
  const [bulkSelectKey, setBulkSelectKey] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<null | { kind: "bulk" } | { kind: "single"; id: number }>(
    null,
  );
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const headerSelectAllRef = useRef<HTMLInputElement>(null);

  const activeFilterCount = useMemo(() => countActiveBundleListFilters(appliedFilters), [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const af = appliedFilters;
      const priceMin = af.priceMin.trim() ? Number.parseFloat(af.priceMin.replace(",", ".")) : undefined;
      const priceMax = af.priceMax.trim() ? Number.parseFloat(af.priceMax.replace(",", ".")) : undefined;
      const stockMin = af.stockMin.trim() ? Number.parseInt(af.stockMin, 10) : undefined;
      const stockMax = af.stockMax.trim() ? Number.parseInt(af.stockMax, 10) : undefined;
      setBundles(
        await listBundles({
          tenantId: DEFAULT_TENANT_ID,
          name: af.name.trim() || undefined,
          eanSku: af.eanSku.trim() || undefined,
          activeFilter: af.status,
          priceMin: Number.isFinite(priceMin!) ? priceMin : undefined,
          priceMax: Number.isFinite(priceMax!) ? priceMax : undefined,
          stockMin: Number.isFinite(stockMin!) ? stockMin : undefined,
          stockMax: Number.isFinite(stockMax!) ? stockMax : undefined,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać zestawów.");
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    if (!isHydrated) return;
    void load();
  }, [load, isHydrated]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkMode("none");
    setBulkSelectKey((k) => k + 1);
  }, []);

  useEffect(() => {
    clearSelection();
    setPage(1);
  }, [appliedFiltersKey, clearSelection]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openEdit = (id: number) => navigate(`/bundles/${id}/edit`);

  const toggleFiltersExpanded = toggleFiltersPanel;

  const totalCount = bundles.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const displayRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return bundles.slice(start, start + rowsPerPage);
  }, [bundles, page, rowsPerPage]);

  const displayRowIds = useMemo(() => displayRows.map((b) => b.id), [displayRows]);
  const allPageSelected = displayRowIds.length > 0 && displayRowIds.every((id) => selectedIds.has(id));
  const somePageSelected = displayRowIds.some((id) => selectedIds.has(id));

  useLayoutEffect(() => {
    const el = headerSelectAllRef.current;
    if (el) {
      el.indeterminate = bulkMode !== "filtered_all" && somePageSelected && !allPageSelected;
    }
  }, [bulkMode, somePageSelected, allPageSelected]);

  const effectiveSelectionCount = bulkMode === "filtered_all" ? totalCount : selectedIds.size;

  const isRowSelected = useCallback(
    (id: number) => bulkMode === "filtered_all" || selectedIds.has(id),
    [bulkMode, selectedIds],
  );

  const toggleSelectOne = (id: number) => {
    if (bulkMode === "filtered_all") {
      setBulkMode("explicit");
      setSelectedIds(new Set([id]));
      return;
    }
    setBulkMode("explicit");
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      if (n.size === 0) setBulkMode("none");
      return n;
    });
  };

  const selectAllOnPage = () => {
    setBulkMode("explicit");
    setSelectedIds(new Set(displayRowIds));
  };

  const selectAllFiltered = () => {
    if (totalCount < 1) return;
    setBulkMode("filtered_all");
    setSelectedIds(new Set());
  };

  const toggleSelectPage = () => {
    if (bulkMode === "filtered_all") {
      clearSelection();
      return;
    }
    setBulkMode("explicit");
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allPageSelected) {
        displayRowIds.forEach((id) => n.delete(id));
      } else {
        displayRowIds.forEach((id) => n.add(id));
      }
      if (n.size === 0) setBulkMode("none");
      return n;
    });
  };

  const headerChecked = bulkMode === "filtered_all" || allPageSelected;
  const headerIndeterminate = bulkMode !== "filtered_all" && somePageSelected && !allPageSelected;
  const bulkToolbarDisabled = effectiveSelectionCount === 0;

  const selectedSorted = useMemo(() => Array.from(selectedIds).sort((a, b) => a - b), [selectedIds]);
  const allBundleIds = useMemo(() => bundles.map((b) => b.id), [bundles]);

  const resolveBulkDeleteIds = () => {
    if (bulkMode === "filtered_all") return allBundleIds;
    return selectedSorted.filter((id) => bundles.some((b) => b.id === id));
  };

  const exportSelectedIds = useMemo(() => {
    if (bulkMode === "filtered_all") return allBundleIds;
    if (selectedSorted.length > 0) return selectedSorted;
    return [];
  }, [bulkMode, allBundleIds, selectedSorted]);

  const runDeleteBundles = async () => {
    if (deleteConfirm == null) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      if (deleteConfirm.kind === "bulk") {
        const ids = resolveBulkDeleteIds();
        if (ids.length === 0) {
          setDeleteConfirm(null);
          return;
        }
        const res = await postBundlesBulkDelete({ tenant_id: DEFAULT_TENANT_ID, ids });
        if (res.errors?.length) {
          setErr(res.errors.join(" "));
        } else {
          setDeleteConfirm(null);
          clearSelection();
          await load();
          setToast(summarizeEntityBulkDeleteToast(res));
        }
      } else {
        const res = await deleteBundle(DEFAULT_TENANT_ID, deleteConfirm.id);
        if (res.errors?.length) {
          setErr(res.errors.join(" "));
        } else {
          setDeleteConfirm(null);
          setSelectedIds((prev) => {
            const n = new Set(prev);
            n.delete(deleteConfirm.id);
            return n;
          });
          await load();
          setToast(summarizeEntityBulkDeleteToast(res));
        }
      }
    } catch {
      setErr("Nie udało się usunąć zestawów.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleMultiMenuSelect = (id: BundleMultiMenuActionId) => {
    if (bulkToolbarDisabled) return;
    if (id === "delete") {
      setDeleteConfirm({ kind: "bulk" });
      return;
    }
    if (id === "export") {
      setExportOpen(true);
    }
  };

  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

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
          className="fixed bottom-6 left-1/2 z-[90] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-950 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <PageLayout fullBleed>
        <ListPageHeader
          title={`${UI_STRINGS.navigation.bundles}${loading ? "" : ` (${totalCount} wyników)`}`}
          description="Produkty składające się z wielu komponentów magazynowych."
          breadcrumbs={[
            { label: "Asortyment", to: "/products/list" },
            { label: UI_STRINGS.navigation.bundles },
          ]}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleFiltersExpanded}
                className={listSellasistToolbarToggleBtn}
                aria-expanded={filtersExpanded}
              >
                {filtersExpanded ? "Ukryj filtry" : bundleListFilterToggleLabel(activeFilterCount)}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <button
                type="button"
                onClick={() => setFilterFieldsOpen(true)}
                className={listSellasistToolbarSquareBtn}
                title="Widoczne pola"
                aria-label="Widoczne pola filtrów"
              >
                <Columns3 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
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
          }
        />

        <BundlesListFiltersPanel
          expanded={filtersExpanded}
          draft={draftFilters}
          onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
          onApply={applyFilters}
          onClear={clearFilters}
          listView={listViewActions}
          filterFieldOrder={filterFieldOrder}
          onFilterFieldOrderSave={setFilterFieldOrder}
        />

        {err && !loading && bundles.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</div>
        ) : null}

        {loading ? (
          <div className="space-y-2 py-8" aria-busy="true" aria-label="Ładowanie listy zestawów">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : err && bundles.length === 0 ? (
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
        ) : bundles.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <AppEmptyState
              icon={Package}
              title="Brak zestawów"
              description="Zmień filtry lub utwórz pierwszy zestaw produktów składających się z wielu komponentów."
              action={
                <Link
                  to="/bundles/new"
                  className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  Dodaj pierwszy zestaw
                </Link>
              }
            />
          </div>
        ) : (
          <div className={`${moduleTableCardClass} min-w-0`}>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <BundlesListBulkBar
                bulkSelectMenuKey={bulkSelectKey}
                bulkToolbarDisabled={bulkToolbarDisabled}
                totalCount={totalCount}
                effectiveSelectionCount={effectiveSelectionCount}
                bulkSelectionMode={bulkMode}
                headerChecked={headerChecked}
                headerIndeterminate={headerIndeterminate}
                onSelectPage={selectAllOnPage}
                onSelectFiltered={selectAllFiltered}
                onClearSelection={clearSelection}
                onSelectMenuBump={() => setBulkSelectKey((k) => k + 1)}
                onMultiMenuSelect={handleMultiMenuSelect}
                onExport={() => setExportOpen(true)}
              />
              {effectiveSelectionCount > 0 ? (
                <div className="border-b border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950 sm:text-sm">
                  Zaznaczono: <span className="font-semibold tabular-nums">{effectiveSelectionCount}</span>. Rekordy
                  powiązane z historią mogą zostać zarchiwizowane zamiast usunięte.
                </div>
              ) : null}
              <BundlesListTable
                rows={displayRows}
                isRowSelected={isRowSelected}
                headerChecked={headerChecked}
                headerSelectAllRef={headerSelectAllRef}
                deleteBusy={deleteBusy}
                onToggleOne={toggleSelectOne}
                onToggleAllPage={toggleSelectPage}
                onRowOpen={openEdit}
                onPreview={setPreviewBundle}
                onEdit={openEdit}
                onDelete={(id) => setDeleteConfirm({ kind: "single", id })}
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
                    onClick={() => setPage((pg) => Math.max(1, pg - 1))}
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
                    onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))}
                    className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                  >
                    Następna
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(totalPages)}
                    className="ml-0.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40"
                  >
                    Ostatnia
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageLayout>

      <FilterVisibilityModal
        open={filterFieldsOpen}
        onClose={() => setFilterFieldsOpen(false)}
        title="Widoczne pola — zestawy"
        selectedOrder={filterFieldOrder}
        catalog={BUNDLE_LIST_FILTER_CATALOG}
        onSave={setFilterFieldOrder}
      />

      {previewBundle != null ? (
        <div
          className="fixed inset-0 z-[255] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewBundle(null)}
        >
          <div
            className="max-h-[min(90vh,32rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">{previewBundle.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              Stan zestawu:{" "}
              <span className="font-semibold text-slate-800">{previewBundle.calculated_stock ?? 0} szt.</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {previewBundle.items.map((it) => {
                const qty = Math.max(1, Math.floor(it.quantity));
                const st = it.product_stock ?? 0;
                const per = Math.floor(st / qty);
                return (
                  <li key={it.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                    <div className="font-medium text-slate-800">
                      {(it.product_name ?? `Produkt #${it.product_id}`).trim()}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      W zestawie: {qty} · Stan: {st} → max {per} zest.
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="mt-6 w-full rounded-lg border border-slate-200 py-2 text-slate-700 hover:bg-slate-50"
              onClick={() => setPreviewBundle(null)}
            >
              Zamknij
            </button>
          </div>
        </div>
      ) : null}

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={DEFAULT_TENANT_ID}
        entityType="sets"
        selectedIds={exportSelectedIds.length > 0 ? exportSelectedIds : []}
        fallbackIds={allBundleIds}
      />

      <PanelBulkStatusConfirmModal
        open={deleteConfirm != null}
        variant="danger"
        title={deleteConfirm?.kind === "bulk" ? "Usuń zaznaczone zestawy" : "Usuń zestaw"}
        message="Czy na pewno usunąć?"
        subMessage="Powiązane rekordy zostaną zarchiwizowane."
        confirmLabel="Usuń"
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteConfirm(null);
        }}
        onConfirm={() => void runDeleteBundles()}
      />
    </>
  );
}
