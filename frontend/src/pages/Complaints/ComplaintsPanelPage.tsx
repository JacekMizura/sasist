import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";

import { getComplaintStatusSummary, listComplaints, softDeleteComplaint } from "../../api/complaintsApi";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../hooks/useActiveWarehouseContext";
import type { ComplaintListItem } from "../../types/complaint";
import { COMPLAINT_SIDEBAR_FILTER_LABELS_PL, normalizeComplaintStatus, type ComplaintStatusCode } from "../../types/complaint";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import NewComplaintWizard from "./NewComplaintWizard";
import { ComplaintsListStatusSidebar, type ComplaintPanelFilter } from "../../components/complaints/ComplaintsListStatusSidebar";
import { ComplaintListFiltersPanel } from "../../components/complaints/ComplaintListFiltersPanel";
import { ComplaintsListBulkBar } from "../../components/complaints/ComplaintsListBulkBar";
import { ComplaintsListTable } from "../../components/complaints/ComplaintsListTable";
import { ComplaintsListToolbar } from "../../components/complaints/ComplaintsListToolbar";
import {
  ModuleFilteredAllBanner,
  ModuleListBreadcrumb,
  ModuleStatusSidebarShell,
  ModuleTableCard,
  moduleListContentColumnClass,
  moduleListEmptyStateClass,
  moduleListTwoColumnShellClass,
  moduleTablePaginationFooterClass,
} from "../../components/listPage/moduleList";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { usePanelListBulkSelection } from "../../hooks/usePanelListBulkSelection";

const ROWS_PER_PAGE = 25;

export default function ComplaintsPanelPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { warehouseId } = useActiveWarehouseContext();

  const [rows, setRows] = useState<ComplaintListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [panelFilter, setPanelFilter] = useState<ComplaintPanelFilter>("all");
  const [statusSummary, setStatusSummary] = useState<{ total: number; byKey: Record<string, number> } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ComplaintListItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem("complaints.list.filtersExpanded") === "1";
    } catch {
      return false;
    }
  });
  const [isStatusPanelCollapsed, setIsStatusPanelCollapsed] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const openFilterFieldsRef = useRef<(() => void) | null>(null);
  const [bulkSelectMenuKey, setBulkSelectMenuKey] = useState(0);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setShowNew(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadStatusSummary = useCallback(async () => {
    if (warehouseId == null) {
      setStatusSummary(null);
      return;
    }
    try {
      const s = await getComplaintStatusSummary(DAMAGE_TENANT_ID, warehouseId);
      const byKey: Record<string, number> = {};
      for (const row of s.by_status ?? []) {
        byKey[row.status] = row.count;
      }
      setStatusSummary({ total: s.total, byKey });
    } catch {
      setStatusSummary(null);
    }
  }, [warehouseId]);

  const fetchList = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      setTotalCount(0);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const params: Parameters<typeof listComplaints>[0] = {
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        limit: ROWS_PER_PAGE,
        offset: (page - 1) * ROWS_PER_PAGE,
        sort_by: "deadline_urgency",
        sort_dir: "desc",
      };
      if (q.trim()) params.q = q.trim();
      if (typeof panelFilter === "object" && panelFilter.kind === "status") {
        params.status = panelFilter.status;
      }
      const { items, total } = await listComplaints(params);
      setRows(items);
      setTotalCount(total);
    } catch {
      setErr("Nie udało się wczytać reklamacji.");
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, page, q, panelFilter]);

  useEffect(() => {
    void loadStatusSummary();
  }, [loadStatusSummary]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    setPage(1);
  }, [panelFilter, q]);

  const visibleComplaintIds = useMemo(() => rows.map((r) => String(r.id)), [rows]);
  const appliedFiltersKey = useMemo(() => `${panelFilter}:${q}`, [panelFilter, q]);
  const {
    bulkSelectionMode,
    effectiveSelectionCount,
    selectAllFiltered,
    selectAllOnPage,
    toggleOne,
    clearSelection,
    headerChecked,
    headerIndeterminate,
    isRowSelected,
  } = usePanelListBulkSelection({
    visibleIds: visibleComplaintIds,
    clearOnDeps: [page, appliedFiltersKey, warehouseId],
    serverFilteredTotal: totalCount,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / ROWS_PER_PAGE));
  const startRow = totalCount === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1;
  const endRow = Math.min(page * ROWS_PER_PAGE, totalCount);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [1];
    const max = 5;
    if (totalPages <= max) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (page <= 3) return [1, 2, 3, 4, 5];
    if (page >= totalPages - 2) {
      return Array.from({ length: 5 }, (_, i) => totalPages - 4 + i);
    }
    return [page - 2, page - 1, page, page + 1, page + 2];
  }, [page, totalPages]);

  const countFor = useCallback(
    (code: ComplaintStatusCode) => statusSummary?.byKey[code] ?? "—",
    [statusSummary],
  );

  useEffect(() => {
    if (!actionToast) return;
    const t = window.setTimeout(() => setActionToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [actionToast]);

  const confirmSoftDelete = useCallback(async () => {
    if (deleteTarget == null || warehouseId == null) return;
    setDeletingId(deleteTarget.id);
    setErr(null);
    try {
      const result = await softDeleteComplaint(deleteTarget.id, DAMAGE_TENANT_ID, warehouseId);
      setDeleteTarget(null);
      await loadStatusSummary();
      await fetchList();
      setActionToast(result.mode === "deleted" ? "Reklamacja usunięta" : "Reklamacja zarchiwizowana");
    } catch (e) {
      if (isAxiosError(e)) {
        const data = e.response?.data as unknown;
        const detail =
          typeof data === "object" &&
          data != null &&
          "detail" in data &&
          (typeof (data as { detail: unknown }).detail === "string" ||
            typeof (data as { detail: unknown }).detail === "number")
            ? String((data as { detail: string | number }).detail)
            : null;
        setErr(detail ?? (e.response?.status === 409 ? "Reklamacja posiada chronione powiązania" : null) ?? "Nie udało się usunąć reklamacji.");
      } else {
        setErr("Nie udało się usunąć reklamacji.");
      }
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, warehouseId, loadStatusSummary, fetchList]);

  const toggleFiltersExpanded = () => {
    setFiltersExpanded((prev) => {
      const n = !prev;
      try {
        localStorage.setItem("complaints.list.filtersExpanded", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const selectionToolbarDisabled = warehouseId == null || effectiveSelectionCount === 0;

  const activeFilterLabel = useMemo(() => {
    if (panelFilter === "all") return "Wszystkie";
    return COMPLAINT_SIDEBAR_FILTER_LABELS_PL[panelFilter.status];
  }, [panelFilter]);

  return (
    <>
      <ModuleListBreadcrumb items={[{ label: "Reklamacje", to: "/complaints" }, { label: "Lista" }]} />

      <div className={moduleListTwoColumnShellClass}>
        {warehouseId != null ? (
          <ModuleStatusSidebarShell
            collapsed={isStatusPanelCollapsed}
            onToggleCollapsed={() => setIsStatusPanelCollapsed((v) => !v)}
            mobileOpenLabel="Statusy panelu"
            statusDrawerOpen={statusDrawerOpen}
            onStatusDrawerOpenChange={setStatusDrawerOpen}
            sidebar={
              <ComplaintsListStatusSidebar
                warehouseId={warehouseId}
                totalCount={statusSummary?.total ?? null}
                countFor={countFor}
                panelFilter={panelFilter}
                onPanelFilterChange={setPanelFilter}
                chromeVariant="sellasist"
                collapsed={isStatusPanelCollapsed}
                parentScrollContainer
                onToggleCollapsed={() => setIsStatusPanelCollapsed((v) => !v)}
              />
            }
            mobileDrawerSidebar={
              <ComplaintsListStatusSidebar
                warehouseId={warehouseId}
                totalCount={statusSummary?.total ?? null}
                countFor={countFor}
                panelFilter={panelFilter}
                onPanelFilterChange={(f) => {
                  setPanelFilter(f);
                  setStatusDrawerOpen(false);
                }}
                chromeVariant="sellasist"
              />
            }
          />
        ) : null}

        <div className={moduleListContentColumnClass}>
          <ComplaintsListToolbar
            loading={loading}
            resultCount={totalCount}
            activeFilterLabel={activeFilterLabel}
            filtersExpanded={filtersExpanded}
            onToggleFilters={toggleFiltersExpanded}
            openFilterFieldsRef={openFilterFieldsRef}
            onNewComplaint={() => setShowNew(true)}
          />

          {warehouseId == null ? (
            <div className="rounded-lg border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {ACTIVE_WAREHOUSE_REQUIRED_MESSAGE}
            </div>
          ) : null}

          {err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          ) : null}

          {warehouseId != null ? (
            <ComplaintListFiltersPanel
              expanded={filtersExpanded}
              onToggleExpanded={toggleFiltersExpanded}
              searchValue={q}
              onSearchChange={setQ}
              onApply={() => void fetchList()}
              onClear={() => {
                setQ("");
                setPage(1);
              }}
              filterLayout="embedded"
              openFilterFieldsRef={openFilterFieldsRef}
            />
          ) : null}

          {bulkSelectionMode === "filtered_all" && warehouseId != null ? (
            <ModuleFilteredAllBanner
              count={effectiveSelectionCount}
              onClear={() => {
                clearSelection();
                setBulkSelectMenuKey((k) => k + 1);
              }}
            />
          ) : null}

          {warehouseId != null ? (
            loading ? (
              <div className={moduleListEmptyStateClass}>Ładowanie…</div>
            ) : (
              <ModuleTableCard
                bulkBar={
                  <ComplaintsListBulkBar
                    bulkSelectMenuKey={bulkSelectMenuKey}
                    filteredTotalCount={totalCount}
                    effectiveSelectionCount={effectiveSelectionCount}
                    bulkSelectionMode={bulkSelectionMode}
                    headerChecked={headerChecked}
                    headerIndeterminate={headerIndeterminate}
                    selectionToolbarDisabled={selectionToolbarDisabled}
                    onSelectPage={selectAllOnPage}
                    onSelectFiltered={selectAllFiltered}
                    onClearSelection={clearSelection}
                    onSelectMenuBump={() => setBulkSelectMenuKey((k) => k + 1)}
                    onRefresh={() => void fetchList()}
                  />
                }
                footer={
                  totalCount > 0 ? (
                    <div className={moduleTablePaginationFooterClass}>
                      <span className="text-sm font-medium tabular-nums text-slate-600">
                        {startRow}–{endRow} z {totalCount}
                      </span>
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
                  ) : null
                }
              >
                <ComplaintsListTable
                  rows={rows}
                  isRowSelected={isRowSelected}
                  toggleOne={toggleOne}
                  deletingId={deletingId}
                  onDelete={setDeleteTarget}
                  onNewComplaint={() => setShowNew(true)}
                />
              </ModuleTableCard>
            )
          ) : null}
        </div>
      </div>

      {warehouseId != null && (
        <NewComplaintWizard
          open={showNew}
          onClose={() => setShowNew(false)}
          warehouseId={warehouseId}
          onCreated={(cid) => {
            void loadStatusSummary();
            void fetchList();
            navigate(`/complaints/${cid}`);
          }}
        />
      )}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={() => (deletingId == null ? setDeleteTarget(null) : null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complaint-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="complaint-delete-title" className="text-base font-semibold text-gray-900">
              Delete complaint
            </h3>
            <p className="mt-2 text-sm text-gray-600">Are you sure you want to delete this complaint?</p>
            <p className="mt-1 text-xs text-gray-500">
              Reklamacja #{deleteTarget.id}
              {deleteTarget.reference_code ? ` · ${deleteTarget.reference_code}` : ""} zostanie ukryta (soft delete).
              Rekordy powiązane z historią mogą zostać zarchiwizowane zamiast usunięte — dane pozostają w bazie dla audytu.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={deletingId != null}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId != null}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => void confirmSoftDelete()}
              >
                {deletingId != null ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {actionToast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[90] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-950 shadow-lg"
        >
          {actionToast}
        </div>
      ) : null}
    </>
  );
}
