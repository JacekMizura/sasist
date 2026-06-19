import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Home, Package } from "lucide-react";

import { getShippingMethods, type ShippingMethodDto } from "../../api/shippingMethodsApi";
import {
  RETURN_OPERATIONAL_QUEUE_KEYS,
  getWmsReturnQueueCounts,
  listAllWmsReturns,
  listWmsReturnWorkflowStatuses,
  type ReturnOperationalQueueKey,
  type WmsReturnsSidebarPanelArg,
} from "../../api/wmsReturnsApi";
import { getReturnPanelSubgroups, getReturnUiStatusSummary } from "../../api/returnUiStatusApi";
import type {
  ReturnStatusRead,
  ReturnUiPanelSubgroupRead,
  ReturnUiStatusPanelSummary,
  WmsReturnListItem,
} from "../../types/wmsReturn";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { PanelBulkStatusConfirmModal } from "../../components/orders/panelList/PanelBulkStatusConfirmModal";
import { deletePanelReturn, postReturnsBulkDelete, postReturnsBulkPanelStatus } from "../../api/panelBulkStatusApi";
import type { EntityBulkDeleteResult } from "../../types/entityBulkDelete";
import { summarizeEntityBulkDeleteToast } from "../../types/entityBulkDelete";
import { usePanelListBulkSelection } from "../../hooks/usePanelListBulkSelection";
import { useWarehouse } from "../../context/WarehouseContext";
import { ReturnListFiltersPanel } from "../../components/returns/returnList/ReturnListFiltersPanel";
import {
  DEFAULT_APPLIED_RETURN_LIST_FILTERS,
  type AppliedReturnListFilters,
} from "../../components/returns/returnList/returnListFilterTypes";
import { ReturnsListTable } from "../../components/returns/returnList/ReturnsListTable";
import { ReturnsListToolbar } from "../../components/returns/returnList/ReturnsListToolbar";
import {
  OrderStatusSidebar,
  ORDERS_PANEL_GROUP_LABELS,
  type OrderPanelFilter,
} from "../../components/orders/OrderStatusSidebar";
import { PANEL_STATUS_SIDEBAR_PAGE_SHELL_CLASS } from "../../components/panel/panelStatusTreeStyles";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import { PanelSidebarOperationalRow } from "../../components/panel/PanelSidebarOperationalRow";
import { panelTreeCountClass } from "../../components/panel/panelStatusTreeStyles";
import ReturnsModuleTabsStrip from "./ReturnsModuleTabsStrip";

function panelFilterToSidebarArg(f: OrderPanelFilter): WmsReturnsSidebarPanelArg {
  if (f === "all") return undefined;
  if (f === "unassigned") return { kind: "unassigned" };
  if (typeof f === "object" && f.kind === "group") return { kind: "group", mainGroup: f.group };
  if (typeof f === "object" && f.kind === "sub") return { kind: "sub", subStatusId: f.id };
  return undefined;
}

const RETURN_QUEUE_TAB_LABELS: Record<ReturnOperationalQueueKey, string> = {
  wszystkie: "Wszystkie",
  nowe: "Nowe",
  w_toku: "W toku",
  do_decyzji: "Do decyzji",
  uszkodzone: "Uszkodzone",
  odrzucone: "Odrzucone",
  rozliczone: "Rozliczone",
  refundacje: "Refundacje",
  reklamacje: "Reklamacje",
};

const RETURNS_SIDEBAR_OPERATIONAL_QUEUE_KEYS: ReturnOperationalQueueKey[] = [
  "do_decyzji",
  "uszkodzone",
  "refundacje",
  "reklamacje",
  "odrzucone",
  "rozliczone",
];

function returnOperationalQueueCollapsedDotClass(key: ReturnOperationalQueueKey): string {
  switch (key) {
    case "do_decyzji":
      return "bg-amber-500";
    case "uszkodzone":
      return "bg-orange-500";
    case "refundacje":
      return "bg-emerald-500";
    case "reklamacje":
      return "bg-violet-500";
    case "odrzucone":
      return "bg-red-500";
    case "rozliczone":
      return "bg-slate-500";
    default:
      return "bg-slate-400";
  }
}

function parseReturnOperationalQueue(searchParams: URLSearchParams): ReturnOperationalQueueKey {
  const raw = (searchParams.get("kolejka") ?? "wszystkie").trim().toLowerCase().replace(/-/g, "_");
  if ((RETURN_OPERATIONAL_QUEUE_KEYS as readonly string[]).includes(raw)) {
    return raw as ReturnOperationalQueueKey;
  }
  return "wszystkie";
}

function panelFilterMatchesGroup(f: OrderPanelFilter, g: OrderUiMainGroup): boolean {
  return typeof f === "object" && f.kind === "group" && f.group === g;
}

function formatActiveFilterLabel(
  panelFilter: OrderPanelFilter,
  operationalQueue: ReturnOperationalQueueKey,
  panelSummary: ReturnUiStatusPanelSummary | null,
): string {
  if (operationalQueue !== "wszystkie" && operationalQueue !== "nowe" && operationalQueue !== "w_toku") {
    return RETURN_QUEUE_TAB_LABELS[operationalQueue];
  }
  if (panelFilter === "unassigned") return "Bez etykiety";
  if (panelFilter === "all") return "Wszystkie";
  if (typeof panelFilter === "object" && panelFilter.kind === "group") {
    const groupLabel = ORDERS_PANEL_GROUP_LABELS[panelFilter.group];
    if (operationalQueue === "nowe" && panelFilter.group === "NEW") return groupLabel;
    if (operationalQueue === "w_toku" && panelFilter.group === "IN_PROGRESS") return groupLabel;
    return groupLabel;
  }
  if (typeof panelFilter === "object" && panelFilter.kind === "sub") {
    for (const block of panelSummary?.groups ?? []) {
      for (const s of block.sub_statuses) {
        if (s.id === panelFilter.id) {
          return `${ORDERS_PANEL_GROUP_LABELS[block.main_group]} — ${s.name}`;
        }
      }
    }
    return `Etykieta #${panelFilter.id}`;
  }
  return "Wszystkie";
}

/**
 * Office/admin overview of returns (Sellasist-style rows).
 * WMS terminal keeps its own task-first UI — do not import this file there.
 */
export default function ReturnsListPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const operationalQueue = useMemo(() => parseReturnOperationalQueue(searchParams), [searchParams]);
  const { warehouse, warehouses } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [rows, setRows] = useState<WmsReturnListItem[]>([]);
  const [panelSummary, setPanelSummary] = useState<ReturnUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<ReturnUiPanelSubgroupRead[] | null>(null);
  const [queueCounts, setQueueCounts] = useState<Partial<Record<ReturnOperationalQueueKey, number>>>({});
  const [panelFilter, setPanelFilter] = useState<OrderPanelFilter>("all");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem("returns.list.filtersExpanded") === "1";
    } catch {
      return false;
    }
  });
  const [draftFilters, setDraftFilters] = useState<AppliedReturnListFilters>(DEFAULT_APPLIED_RETURN_LIST_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AppliedReturnListFilters>(DEFAULT_APPLIED_RETURN_LIST_FILTERS);
  const [workflowStatuses, setWorkflowStatuses] = useState<ReturnStatusRead[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodDto[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState<{ status: string; label: string } | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<null | { kind: "bulk" } | { kind: "single"; id: number }>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [bulkSelectMenuKey, setBulkSelectMenuKey] = useState(0);
  const openFilterFieldsRef = useRef<(() => void) | null>(null);
  const [isStatusPanelCollapsed, setIsStatusPanelCollapsed] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);

  const appliedFiltersKey = useMemo(() => JSON.stringify(appliedFilters), [appliedFilters]);
  const effectiveWarehouseId = appliedFilters.listWarehouseId ?? warehouseId ?? null;
  const activeFilterLabel = useMemo(
    () => formatActiveFilterLabel(panelFilter, operationalQueue, panelSummary),
    [panelFilter, operationalQueue, panelSummary],
  );

  const handlePanelFilterChange = useCallback(
    (f: OrderPanelFilter) => {
      setPanelFilter(f);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (f === "all") {
            next.delete("kolejka");
            return next;
          }
          if (f === "unassigned") {
            next.delete("kolejka");
            return next;
          }
          if (typeof f === "object" && f.kind === "sub") {
            next.delete("kolejka");
            return next;
          }
          if (typeof f === "object" && f.kind === "group") {
            if (f.group === "NEW") {
              next.set("kolejka", "nowe");
              return next;
            }
            if (f.group === "IN_PROGRESS") {
              next.set("kolejka", "w_toku");
              return next;
            }
            if (f.group === "DONE") {
              next.delete("kolejka");
              return next;
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const selectOperationalQueue = useCallback(
    (key: ReturnOperationalQueueKey) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key === "wszystkie") {
            next.delete("kolejka");
          } else {
            next.set("kolejka", key);
          }
          return next;
        },
        { replace: true },
      );
      if (key === "nowe") {
        setPanelFilter((prev) =>
          panelFilterMatchesGroup(prev, "NEW") ? prev : { kind: "group", group: "NEW" },
        );
      } else if (key === "w_toku") {
        setPanelFilter((prev) =>
          panelFilterMatchesGroup(prev, "IN_PROGRESS") ? prev : { kind: "group", group: "IN_PROGRESS" },
        );
      }
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (operationalQueue === "nowe") {
      setPanelFilter((prev) =>
        panelFilterMatchesGroup(prev, "NEW") ? prev : { kind: "group", group: "NEW" },
      );
    } else if (operationalQueue === "w_toku") {
      setPanelFilter((prev) =>
        panelFilterMatchesGroup(prev, "IN_PROGRESS") ? prev : { kind: "group", group: "IN_PROGRESS" },
      );
    }
  }, [operationalQueue]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const effectiveWh = appliedFilters.listWarehouseId ?? warehouseId;
      const sidebarArg = panelFilterToSidebarArg(panelFilter);
      const countPromise =
        effectiveWh != null && effectiveWh > 0
          ? getWmsReturnQueueCounts({
              tenantId: DAMAGE_TENANT_ID,
              warehouseId: effectiveWh,
              sidebarPanel: sidebarArg,
              filters: appliedFilters,
            })
          : Promise.resolve({ counts: {} as Partial<Record<ReturnOperationalQueueKey, number>> });

      const [data, summary, sgroups, rsList, smList, qc] = await Promise.all([
        listAllWmsReturns({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId: effectiveWh,
          sidebarPanel: sidebarArg,
          filters: appliedFilters,
          operationalQueue,
        }),
        getReturnUiStatusSummary(DAMAGE_TENANT_ID, effectiveWh),
        getReturnPanelSubgroups(DAMAGE_TENANT_ID, effectiveWh),
        effectiveWh != null && effectiveWh > 0
          ? listWmsReturnWorkflowStatuses(DAMAGE_TENANT_ID, effectiveWh)
          : Promise.resolve([]),
        effectiveWh != null && effectiveWh > 0
          ? getShippingMethods({ tenant_id: DAMAGE_TENANT_ID, warehouse_id: effectiveWh, active_only: false })
          : Promise.resolve([]),
        countPromise,
      ]);
      setRows(data);
      setPanelSummary(summary);
      setPanelSubgroups(sgroups);
      setWorkflowStatuses(rsList);
      setShippingMethods(smList);
      setQueueCounts(qc.counts ?? {});
    } catch {
      setErr("Nie udało się wczytać listy zwrotów.");
      setRows([]);
      setPanelSubgroups(null);
      setQueueCounts({});
    } finally {
      setLoading(false);
    }
  }, [panelFilter, warehouseId, appliedFilters, operationalQueue]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => {
      void load();
    };
    window.addEventListener("wms-returns-list-refresh", onRefresh);
    return () => window.removeEventListener("wms-returns-list-refresh", onRefresh);
  }, [load]);

  useEffect(() => {
    if (panelFilter !== "unassigned") return;
    if (panelSummary != null && panelSummary.unassigned_count === 0) {
      setPanelFilter("all");
    }
  }, [panelFilter, panelSummary]);

  const visibleReturnIds = useMemo(() => rows.map((r) => String(r.id)), [rows]);
  const {
    selectedIds,
    bulkSelectionMode,
    effectiveSelectionCount,
    selectAllOnPage,
    toggleOne,
    clearSelection,
    headerChecked,
    headerIndeterminate,
    isRowSelected,
  } = usePanelListBulkSelection({
    visibleIds: visibleReturnIds,
    clearOnDeps: [panelFilter, appliedFiltersKey, warehouseId, operationalQueue],
  });

  const resolveBulkReturnStatusLabel = useCallback(
    (statusVal: string): string => {
      if (statusVal === "") return "Bez etykiety (wyczyść)";
      const id = Number(statusVal);
      if (!Number.isFinite(id)) return statusVal;
      for (const block of panelSummary?.groups ?? []) {
        for (const s of block.sub_statuses) {
          if (s.id === id) return `${ORDERS_PANEL_GROUP_LABELS[block.main_group]}: ${s.name}`;
        }
      }
      return `Etykieta #${id}`;
    },
    [panelSummary],
  );

  const runDeleteReturns = useCallback(async () => {
    if (deleteConfirm == null) return;
    setDeleteSubmitting(true);
    setErr(null);
    try {
      let res: EntityBulkDeleteResult;
      if (deleteConfirm.kind === "bulk") {
        const ids = selectedIds.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
        if (ids.length === 0) {
          setDeleteConfirm(null);
          return;
        }
        res = await postReturnsBulkDelete(DAMAGE_TENANT_ID, { ids }, warehouseId);
      } else {
        res = await deletePanelReturn(DAMAGE_TENANT_ID, deleteConfirm.id, warehouseId);
      }
      if (res.errors?.length) {
        setErr(res.errors.join(" "));
      } else {
        setDeleteConfirm(null);
        clearSelection();
        setBulkSelectMenuKey((k) => k + 1);
        await load();
        setToast(summarizeEntityBulkDeleteToast(res));
      }
    } catch {
      setErr("Nie udało się usunąć zwrotów.");
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteConfirm, selectedIds, clearSelection, load, warehouseId]);

  const runBulkReturnStatusChange = useCallback(async () => {
    if (bulkConfirm == null || selectedIds.length === 0) return;
    const count = selectedIds.length;
    setBulkSubmitting(true);
    setErr(null);
    try {
      await postReturnsBulkPanelStatus(
        DAMAGE_TENANT_ID,
        { ids: selectedIds, status: bulkConfirm.status },
        warehouseId,
      );
      setBulkConfirm(null);
      clearSelection();
      setBulkSelectMenuKey((k) => k + 1);
      await load();
      setToast(`Zapisano status panelu dla ${count} zwrotów.`);
    } catch {
      setErr("Nie udało się zmienić statusu panelu dla zaznaczonych zwrotów.");
    } finally {
      setBulkSubmitting(false);
    }
  }, [bulkConfirm, selectedIds, clearSelection, load, warehouseId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toggleFiltersExpanded = () => {
    setFiltersExpanded((prev) => {
      const n = !prev;
      try {
        localStorage.setItem("returns.list.filtersExpanded", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (n) setDraftFilters({ ...appliedFilters });
      return n;
    });
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_APPLIED_RETURN_LIST_FILTERS);
    setAppliedFilters(DEFAULT_APPLIED_RETURN_LIST_FILTERS);
  };

  const openDetail = (returnId: number) => {
    navigate(`/orders/returns/${returnId}`);
  };

  const bulkBusy = bulkSubmitting || deleteSubmitting;
  const bulkToolbarDisabled = bulkBusy || effectiveWarehouseId == null || effectiveSelectionCount === 0;

  const orderSummaryCast = panelSummary as unknown as OrderUiStatusPanelSummary | null;
  const orderSubgroupsCast = panelSubgroups as unknown as OrderUiPanelSubgroupRead[] | null;

  const renderOperationalQueueSidebarRows = (onPick?: () => void) =>
    RETURNS_SIDEBAR_OPERATIONAL_QUEUE_KEYS.map((key) => {
      const active = operationalQueue === key;
      const c = queueCounts[key];
      return (
        <PanelSidebarOperationalRow
          key={key}
          active={active}
          label={RETURN_QUEUE_TAB_LABELS[key]}
          count={typeof c === "number" ? c : undefined}
          onClick={() => {
            selectOperationalQueue(key);
            onPick?.();
          }}
        />
      );
    });

  const operationalQueuesSlot = <>{renderOperationalQueueSidebarRows()}</>;

  const operationalQueuesCollapsedSlot = (
    <>
      {RETURNS_SIDEBAR_OPERATIONAL_QUEUE_KEYS.map((key) => {
        const active = operationalQueue === key;
        const c = queueCounts[key];
        return (
          <button
            key={key}
            type="button"
            className={`flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100 ${
              active ? "bg-slate-100" : ""
            }`}
            onClick={() => selectOperationalQueue(key)}
            title={RETURN_QUEUE_TAB_LABELS[key]}
            aria-label={RETURN_QUEUE_TAB_LABELS[key]}
          >
            <span className={`h-3 w-0.5 shrink-0 rounded-full ${returnOperationalQueueCollapsedDotClass(key)}`} />
            <span className={panelTreeCountClass()}>{typeof c === "number" ? c : "—"}</span>
          </button>
        );
      })}
    </>
  );

  return (
    <>
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-400" aria-label="Ścieżka nawigacji">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 transition hover:text-slate-900"
          aria-label="Panel"
        >
          <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <Link to="/orders/list" className="transition hover:text-slate-900">
          Zamówienia
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="font-medium text-slate-900">Zwroty</span>
      </nav>

      <ReturnsModuleTabsStrip />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {effectiveWarehouseId != null ? (
          <>
            <button
              type="button"
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 lg:hidden"
              onClick={() => setStatusDrawerOpen(true)}
            >
              <Package className="h-4 w-4" aria-hidden />
              Statusy panelu
            </button>
            <aside
              className={`${PANEL_STATUS_SIDEBAR_PAGE_SHELL_CLASS} ${isStatusPanelCollapsed ? "lg:w-14" : "lg:w-[18rem]"}`}
            >
              <OrderStatusSidebar
                warehouseId={effectiveWarehouseId}
                panelSummary={orderSummaryCast}
                panelSubgroups={orderSubgroupsCast}
                panelFilter={panelFilter}
                onPanelFilterChange={handlePanelFilterChange}
                chromeVariant="sellasist"
                collapsed={isStatusPanelCollapsed}
                parentScrollContainer
                onToggleCollapsed={() => setIsStatusPanelCollapsed((v) => !v)}
                manageStatusesHref="/orders/returns/panel-statuses"
                returnsOperationalQueuesSlot={operationalQueuesSlot}
                returnsOperationalQueuesCollapsedSlot={operationalQueuesCollapsedSlot}
              />
            </aside>
            {statusDrawerOpen ? (
              <div className="fixed inset-0 z-[420] flex lg:hidden">
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-900/45"
                  aria-label="Zamknij panel statusów"
                  onClick={() => setStatusDrawerOpen(false)}
                />
                <div className="relative w-[min(20rem,92vw)] overflow-y-auto border-r border-slate-100 bg-white p-3 shadow-xl">
                  <OrderStatusSidebar
                    warehouseId={effectiveWarehouseId}
                    panelSummary={orderSummaryCast}
                    panelSubgroups={orderSubgroupsCast}
                    panelFilter={panelFilter}
                    onPanelFilterChange={(f) => {
                      handlePanelFilterChange(f);
                      setStatusDrawerOpen(false);
                    }}
                    chromeVariant="sellasist"
                    manageStatusesHref="/orders/returns/panel-statuses"
                    returnsOperationalQueuesSlot={renderOperationalQueueSidebarRows(() => setStatusDrawerOpen(false))}
                    returnsOperationalQueuesCollapsedSlot={operationalQueuesCollapsedSlot}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <ReturnsListToolbar
            loading={loading}
            resultCount={rows.length}
            activeFilterLabel={activeFilterLabel}
            filtersExpanded={filtersExpanded}
            onToggleFilters={toggleFiltersExpanded}
            openFilterFieldsRef={openFilterFieldsRef}
          />

          {effectiveWarehouseId == null && (
            <div className="rounded-lg border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Wybierz magazyn w nagłówku lub w filtrach, aby wczytać zwroty.
            </div>
          )}

          {err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          ) : null}

          <ReturnListFiltersPanel
            expanded={filtersExpanded}
            onToggleExpanded={toggleFiltersExpanded}
            draft={draftFilters}
            onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
            onApply={applyFilters}
            onClear={clearFilters}
            panelSummary={panelSummary}
            warehouses={warehouses}
            shippingMethods={shippingMethods}
            returnStatuses={workflowStatuses}
            filterLayout="embedded"
            openFilterFieldsRef={openFilterFieldsRef}
          />

          {bulkSelectionMode === "filtered_all" && effectiveWarehouseId != null ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              Zaznaczono {effectiveSelectionCount} rekordów pasujących do filtrów.{" "}
              <button
                type="button"
                className="font-semibold text-sky-900 underline decoration-sky-400 underline-offset-2 hover:text-sky-950"
                onClick={() => {
                  clearSelection();
                  setBulkSelectMenuKey((k) => k + 1);
                }}
              >
                Wyczyść zaznaczenie
              </button>
            </div>
          ) : null}

          <ReturnsListTable
            rows={rows}
            loading={loading}
            effectiveWarehouseId={effectiveWarehouseId}
            panelSummary={panelSummary}
            bulkBusy={bulkBusy}
            bulkToolbarDisabled={bulkToolbarDisabled}
            bulkSelectMenuKey={bulkSelectMenuKey}
            effectiveSelectionCount={effectiveSelectionCount}
            bulkSelectionMode={bulkSelectionMode}
            headerChecked={headerChecked}
            headerIndeterminate={headerIndeterminate}
            isRowSelected={isRowSelected}
            selectAllOnPage={selectAllOnPage}
            toggleOne={toggleOne}
            clearSelection={clearSelection}
            onBulkSelectMenuKeyBump={() => setBulkSelectMenuKey((k) => k + 1)}
            onBulkStatusConfirm={(status, label) => setBulkConfirm({ status, label })}
            onBulkDelete={() => setDeleteConfirm({ kind: "bulk" })}
            onOpenDetail={openDetail}
            onDeleteSingle={(id) => setDeleteConfirm({ kind: "single", id })}
            resolveBulkReturnStatusLabel={resolveBulkReturnStatusLabel}
            panelSubgroups={orderSubgroupsCast}
          />
        </div>
      </div>

      <PanelBulkStatusConfirmModal
        open={deleteConfirm != null}
        variant="danger"
        title={deleteConfirm?.kind === "bulk" ? "Usuń zaznaczone zwroty" : "Usuń zwrot"}
        message="Czy na pewno usunąć?"
        subMessage="Powiązane rekordy zostaną zarchiwizowane."
        confirmLabel="Usuń"
        busy={deleteSubmitting}
        onCancel={() => {
          if (!deleteSubmitting) setDeleteConfirm(null);
        }}
        onConfirm={() => void runDeleteReturns()}
      />

      <PanelBulkStatusConfirmModal
        open={bulkConfirm != null}
        title="Zmiana statusu panelu"
        message={
          bulkConfirm
            ? bulkConfirm.status === ""
              ? `Czy usunąć etykietę panelu z ${selectedIds.length} zwrotów?`
              : `Czy ustawić „${bulkConfirm.label}” dla ${selectedIds.length} zwrotów?`
            : ""
        }
        busy={bulkSubmitting}
        onCancel={() => {
          if (!bulkSubmitting) setBulkConfirm(null);
        }}
        onConfirm={() => void runBulkReturnStatusChange()}
      />

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[90] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-950 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
