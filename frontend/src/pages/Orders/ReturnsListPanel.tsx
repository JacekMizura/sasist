import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  ExternalLink,
  Home,
  MoreHorizontal,
  Package,
  Table2,
  Trash2,
  Wrench,
} from "lucide-react";

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
import { WMS_ROUTES } from "../wms/wmsRoutes";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import { PanelBulkStatusConfirmModal } from "../../components/orders/panelList/PanelBulkStatusConfirmModal";
import { PanelListDenseProductCell } from "../../components/panelList/PanelListDenseProductCell";
import { firstProductImageUrl } from "../../components/panelList/ProductListItem";
import {
  OperationalActionButton,
  OperationalActionColumn,
  OperationalActionLink,
  operationalActionsColumnCellClass,
  operationalActionsColumnHeaderClass,
  operationalCheckboxColumnCellClass,
  operationalCheckboxColumnHeaderClass,
  panelListDenseCheckboxInputClass,
  panelListDenseRowClass,
  panelListDenseRowSelectedClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "../../components/operational";
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
import {
  OrderStatusSidebar,
  ORDERS_PANEL_GROUP_LABELS,
  type OrderPanelFilter,
} from "../../components/orders/OrderStatusSidebar";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import {
  listSellasistInputClass,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";
import {
  panelSidebarFilterRowClass,
  panelSidebarSubCountBadgeClass,
  panelSidebarSubRowStyleRich,
} from "../../utils/panelSidebarHierarchy";
import ReturnsModuleTabsStrip from "./ReturnsModuleTabsStrip";
import type { PanelConfigurableUiStatusBrief } from "../../utils/panelListStatusBriefMappers";
import { returnUiStatusBriefToPanelBrief, returnWorkflowStatusToPanelBrief } from "../../utils/panelListStatusBriefMappers";

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

/** Kolejki pod workflow (Nowe / W toku przez nagłówki grup + „Wszystkie”) — tylko dodatkowe widoki operacyjne. */
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

const KNOWN_SOURCE_LABEL: Record<string, string> = {
  allegro: "Allegro",
  ebay: "eBay",
  amazon: "Amazon",
  empik: "Empik",
  shoper: "Shoper",
  woocommerce: "WooCommerce",
  prestashop: "PrestaShop",
  bricklink: "Bricklink",
};

function normalizeOrderSourceDisplay(raw?: string | null): string {
  const s = (raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return "—";
  const low = s.toLowerCase();
  if (KNOWN_SOURCE_LABEL[low]) return KNOWN_SOURCE_LABEL[low];
  const spaced = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  if (spaced !== s) {
    return spaced
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  if (/[\s_\-]+/.test(s)) {
    return s
      .split(/[\s_\-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return s.length > 1 ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s.toUpperCase();
}

function formatReturnDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return "—";
  }
}

function returnTypeBadgeLabel(t?: WmsReturnListItem["return_type"]): string {
  if (t === "UNCLAIMED") return "Nieodebrana";
  return "RMA";
}

function formatPlnAlways(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);
  } catch {
    return `${n.toFixed(2)} PLN`;
  }
}

function panelListRefundTotalPln(r: WmsReturnListItem): string {
  const pre = r.total_refund_amount;
  if (pre != null && Number.isFinite(Number(pre))) {
    return formatPlnAlways(Number(pre));
  }
  const ref = r.refund;
  let total = 0;
  if (ref?.refund_amount != null && Number.isFinite(Number(ref.refund_amount))) {
    total += Number(ref.refund_amount);
  }
  if (ref?.refund_shipping) {
    const sa = ref.refund_shipping_amount;
    if (sa != null && Number.isFinite(Number(sa))) {
      total += Number(sa);
    } else if (r.shipping_cost != null && Number.isFinite(Number(r.shipping_cost))) {
      total += Number(r.shipping_cost);
    }
  }
  return formatPlnAlways(total);
}

function firstImageUrl(imageUrl: string | null | undefined): string | null {
  const raw = firstProductImageUrl(imageUrl);
  return raw ? resolveDamageMediaUrl(raw) : null;
}

function returnListRowStatusPillStyle(brief: PanelConfigurableUiStatusBrief): CSSProperties {
  const base = panelSidebarSubRowStyleRich(brief, brief.main_group, false, {
    barWidthPx: 0,
    inlineLabel: true,
  });
  return { ...base, borderLeft: "none" };
}

/** Tylko odczyt — zmiana statusu w szczegółach RMZ lub przez akcje masowe. */
function ReturnsListRowStatusBadges({ r }: { r: WmsReturnListItem }) {
  const wfBrief = returnWorkflowStatusToPanelBrief(r.status);
  const uiBrief = r.ui_status ? returnUiStatusBriefToPanelBrief(r.ui_status) : null;
  const uiTerminal = r.ui_status?.main_group === "DONE";
  const wfTerminal = r.status.type === "done_success" || r.status.type === "done_rejected";
  const wfPositive = r.status.type === "done_success";

  const labelUpper = (name: string) => name.trim().toUpperCase();

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" aria-label="Status zwrotu">
      {uiBrief ? (
        <span
          className="inline-flex max-w-[min(100%,14rem)] items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={returnListRowStatusPillStyle(uiBrief)}
          title={uiBrief.name}
        >
          {uiTerminal ? (
            <span className="shrink-0 text-emerald-800/80" aria-hidden>
              ✓
            </span>
          ) : null}
          <span className="min-w-0 truncate">{labelUpper(uiBrief.name)}</span>
          {r.ui_status?.is_active === false ? (
            <span className="shrink-0 rounded bg-black/[0.06] px-0.5 text-[9px] font-medium normal-case tracking-normal text-slate-600">
              wył.
            </span>
          ) : null}
        </span>
      ) : (
        <span className="inline-flex rounded border border-dashed border-slate-200/90 bg-slate-50/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Bez etykiety
        </span>
      )}
      <span
        className="inline-flex max-w-[min(100%,14rem)] items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={returnListRowStatusPillStyle(wfBrief)}
        title={wfBrief.name}
      >
        {wfTerminal ? (
          <span
            className={`shrink-0 ${wfPositive ? "text-emerald-800/80" : "text-slate-600/85"}`}
            aria-hidden
          >
            ✓
          </span>
        ) : null}
        <span className="min-w-0 truncate">{labelUpper(wfBrief.name)}</span>
      </span>
    </div>
  );
}

function isReturnsListRowArchivedTone(r: WmsReturnListItem): boolean {
  const wfDone = r.status.type === "done_success" || r.status.type === "done_rejected";
  const panelDone = r.ui_status?.main_group === "DONE";
  return wfDone || panelDone;
}

const RETURNS_LIST_ROW_ARCHIVED_CLASS =
  "bg-emerald-50/40 [&_.returns-list-row-actions]:opacity-[0.72] [&_.returns-list-row-actions]:saturate-[0.88]";

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

  return (
    <>
      <nav className="mb-2.5 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Ścieżka nawigacji">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800"
            aria-label="Panel"
          >
            <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          <Link to="/orders/list" className="font-medium text-slate-500 transition hover:text-slate-800">
            Zamówienia
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
          <span className="font-medium text-slate-600">Zwroty</span>
        </nav>

      <ReturnsModuleTabsStrip />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {effectiveWarehouseId != null ? (
              <>
                <button
                  type="button"
                  className="flex shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 lg:hidden"
                  onClick={() => setStatusDrawerOpen(true)}
                >
                  Statusy panelu
                </button>
                <aside
                  className={`hidden min-h-0 min-w-0 shrink-0 flex-col gap-2 lg:sticky lg:top-3 lg:z-30 lg:flex lg:max-h-[calc(100dvh-5.75rem)] lg:overflow-y-auto lg:overscroll-y-contain lg:border-r lg:border-slate-200/90 lg:bg-slate-50/95 lg:pb-2 lg:pr-2.5 lg:pt-2 lg:shadow-[4px_0_24px_-12px_rgba(15,23,42,0.12)] ${isStatusPanelCollapsed ? "lg:w-14" : "lg:w-64"}`}
                >
                  <button
                    type="button"
                    onClick={() => setIsStatusPanelCollapsed((v) => !v)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-100"
                    aria-label={isStatusPanelCollapsed ? "Rozwiń panel statusów" : "Zwiń panel statusów"}
                  >
                    <ChevronLeft className={`h-4 w-4 transition-transform ${isStatusPanelCollapsed ? "rotate-180" : ""}`} />
                  </button>
                  <OrderStatusSidebar
                    warehouseId={effectiveWarehouseId}
                    panelSummary={orderSummaryCast}
                    panelSubgroups={orderSubgroupsCast}
                    panelFilter={panelFilter}
                    onPanelFilterChange={handlePanelFilterChange}
                    chromeVariant="sellasist"
                    collapsed={isStatusPanelCollapsed}
                    parentScrollContainer
                    manageStatusesHref="/orders/returns/panel-statuses"
                    returnsOperationalQueuesSlot={
                      <>
                        {RETURNS_SIDEBAR_OPERATIONAL_QUEUE_KEYS.map((key) => {
                          const active = operationalQueue === key;
                          const c = queueCounts[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              className={panelSidebarFilterRowClass(active)}
                              onClick={() => selectOperationalQueue(key)}
                            >
                              <span>{RETURN_QUEUE_TAB_LABELS[key]}</span>
                              {typeof c === "number" ? (
                                <span className={panelSidebarSubCountBadgeClass()}>{c}</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </>
                    }
                    returnsOperationalQueuesCollapsedSlot={
                      <>
                        {RETURNS_SIDEBAR_OPERATIONAL_QUEUE_KEYS.map((key) => {
                          const active = operationalQueue === key;
                          const c = queueCounts[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100 ${
                                active ? "bg-slate-100 ring-1 ring-slate-300/80" : ""
                              }`}
                              onClick={() => selectOperationalQueue(key)}
                              title={RETURN_QUEUE_TAB_LABELS[key]}
                              aria-label={RETURN_QUEUE_TAB_LABELS[key]}
                            >
                              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${returnOperationalQueueCollapsedDotClass(key)}`} />
                              <span className={panelSidebarSubCountBadgeClass()}>{typeof c === "number" ? c : "—"}</span>
                            </button>
                          );
                        })}
                      </>
                    }
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
                    <div className="relative w-[min(20rem,92vw)] overflow-y-auto border-r border-slate-200 bg-white p-2">
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
                        returnsOperationalQueuesSlot={
                          <>
                            {RETURNS_SIDEBAR_OPERATIONAL_QUEUE_KEYS.map((key) => {
                              const active = operationalQueue === key;
                              const c = queueCounts[key];
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className={panelSidebarFilterRowClass(active)}
                                  onClick={() => {
                                    selectOperationalQueue(key);
                                    setStatusDrawerOpen(false);
                                  }}
                                >
                                  <span>{RETURN_QUEUE_TAB_LABELS[key]}</span>
                                  {typeof c === "number" ? (
                                    <span className={panelSidebarSubCountBadgeClass()}>{c}</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </>
                        }
                        returnsOperationalQueuesCollapsedSlot={
                          <>
                            {RETURNS_SIDEBAR_OPERATIONAL_QUEUE_KEYS.map((key) => {
                              const active = operationalQueue === key;
                              const c = queueCounts[key];
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  className={`flex w-full items-center justify-between rounded-md px-1 py-1 hover:bg-slate-100 ${
                                    active ? "bg-slate-100 ring-1 ring-slate-300/80" : ""
                                  }`}
                                  onClick={() => {
                                    selectOperationalQueue(key);
                                    setStatusDrawerOpen(false);
                                  }}
                                  title={RETURN_QUEUE_TAB_LABELS[key]}
                                  aria-label={RETURN_QUEUE_TAB_LABELS[key]}
                                >
                                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${returnOperationalQueueCollapsedDotClass(key)}`} />
                                  <span className={panelSidebarSubCountBadgeClass()}>
                                    {typeof c === "number" ? c : "—"}
                                  </span>
                                </button>
                              );
                            })}
                          </>
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="flex min-w-0 flex-1 flex-col space-y-3">
              <div className="flex min-h-10 flex-nowrap items-center justify-between gap-8">
                <div className="flex min-w-0 flex-nowrap items-center gap-2">
                  <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                    Zwroty
                    {!loading ? <span className="font-normal text-slate-500"> ({rows.length} wyników)</span> : null}
                  </h1>
                  <Link
                    to={WMS_ROUTES.returns}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-none transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <Package className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    WMS
                  </Link>
                </div>
                <div className="flex shrink-0 flex-nowrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleFiltersExpanded}
                    className={`${listSellasistToolbarToggleBtn} !h-9 whitespace-nowrap`}
                    aria-expanded={filtersExpanded}
                  >
                    {filtersExpanded ? "Ukryj filtry" : "Pokaż filtry"}
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    className={`${listSellasistToolbarSquareBtn} !h-9 !w-9`}
                    title="Sortowanie — kliknij nagłówki (wkrótce)"
                    aria-label="Sortowanie"
                  >
                    <ArrowUpDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled
                    className={`${listSellasistToolbarSquareBtn} !h-9 !w-9 cursor-not-allowed opacity-40`}
                    title="Kolumny tabeli — wkrótce"
                    aria-label="Kolumny tabeli"
                  >
                    <Table2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                  <details className="relative">
                    <summary
                      className={`${listSellasistToolbarSquareBtn} !h-9 !w-9 cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                      aria-label="Więcej opcji"
                    >
                      <MoreHorizontal className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    </summary>
                    <div className="absolute right-0 z-50 mt-1 min-w-[13rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60">
                      <button
                        type="button"
                        className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                        onClick={() => openFilterFieldsRef.current?.()}
                      >
                        Widoczne pola filtrów
                      </button>
                    </div>
                  </details>
                  <Link
                    to="/orders/returns/statuses"
                    className={`${listSellasistToolbarSquareBtn} !h-9 !w-9`}
                    title="Ustawienia statusów zwrotów"
                    aria-label="Ustawienia statusów zwrotów"
                  >
                    <Wrench className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </Link>
                </div>
              </div>

              {effectiveWarehouseId == null && (
                <div className="rounded-md border border-amber-200/90 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Wybierz magazyn w nagłówku lub w filtrach, aby wczytać zwroty.
                </div>
              )}

              {err && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
              )}

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

              <p className="text-xs text-slate-500">
                Wyniki z serwera (limit 500). Zastosuj filtry, aby odświeżyć listę.{" "}
                <Link to="/orders/returns/statuses" className="font-medium text-blue-700 hover:underline">
                  Statusy zwrotów (panel)
                </Link>
              </p>

              {bulkSelectionMode === "filtered_all" && effectiveWarehouseId != null ? (
                <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
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

              {loading ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Ładowanie…
                </div>
              ) : (
                <div className="min-w-0 overflow-hidden">
                  {!loading && effectiveWarehouseId != null ? (
                    <div className="flex min-h-10 w-full flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden pb-0.5">
                      <select
                        key={bulkSelectMenuKey}
                        defaultValue=""
                        disabled={bulkBusy}
                        aria-label="Opcje zaznaczania listy zwrotów"
                        className={`${listSellasistInputClass} !h-9 max-w-[11rem] shrink-0 text-sm`}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "page") selectAllOnPage();
                          else if (v === "clear") {
                            clearSelection();
                            setBulkSelectMenuKey((k) => k + 1);
                          }
                          e.target.value = "";
                        }}
                      >
                        <option value="">Zaznacz…</option>
                        <option value="page">Strona</option>
                        <option value="clear">Odznacz</option>
                      </select>
                      {(headerChecked || headerIndeterminate) && (
                        <span className="hidden shrink-0 text-xs text-slate-500 lg:inline" aria-live="polite">
                          {bulkSelectionMode === "filtered_all"
                            ? "Pełny zbiór wg filtrów"
                            : headerChecked
                              ? "Strona"
                              : "Częściowo"}
                        </span>
                      )}
                      <span className="shrink-0 text-xs text-slate-500">wykonaj</span>
                      <label className="flex min-w-0 shrink-0 items-center gap-2 text-slate-700">
                        <span className="sr-only">Zmień status panelu</span>
                        <select
                          key={`${bulkSelectMenuKey}-st`}
                          disabled={bulkToolbarDisabled}
                          defaultValue=""
                          className={`${listSellasistInputClass} !h-9 max-w-[14rem] shrink-0 text-xs disabled:opacity-40`}
                          aria-label="Zmień status panelu dla zaznaczonych zwrotów"
                          onChange={(e) => {
                            const v = e.target.value;
                            e.target.selectedIndex = 0;
                            if (!v || effectiveSelectionCount === 0) return;
                            if (v === "__clear__") {
                              setBulkConfirm({ status: "", label: resolveBulkReturnStatusLabel("") });
                              return;
                            }
                            setBulkConfirm({ status: v, label: resolveBulkReturnStatusLabel(v) });
                          }}
                        >
                          <option value="" disabled>
                            Wybierz akcję
                          </option>
                          <option value="__clear__">Bez etykiety (wyczyść)</option>
                          {(panelSummary?.groups ?? []).map((block) => (
                            <optgroup key={block.main_group} label={ORDERS_PANEL_GROUP_LABELS[block.main_group]}>
                              {block.sub_statuses.map((s) => (
                                <option key={s.id} value={String(s.id)}>
                                  {s.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <span className="hidden shrink-0 text-[11px] font-medium tabular-nums text-slate-500 sm:inline">
                        ({effectiveSelectionCount})
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm({ kind: "bulk" })}
                        disabled={bulkToolbarDisabled}
                        className="inline-flex h-9 shrink-0 items-center rounded-md border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-40"
                      >
                        Usuń
                      </button>
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-9 shrink-0 cursor-not-allowed items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 opacity-40"
                        title="Multiakcje — wkrótce"
                      >
                        Wykonaj multiakcje
                      </button>
                      <button
                        type="button"
                        disabled={bulkToolbarDisabled}
                        className="inline-flex h-9 shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                        onClick={() => {
                          clearSelection();
                          setBulkSelectMenuKey((k) => k + 1);
                        }}
                      >
                        Odznacz
                      </button>
                    </div>
                  ) : null}

                  {rows.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-slate-500">Brak zwrotów do wyświetlenia.</div>
                  ) : (
                    <div className={panelListDenseTableScrollWrapClass}>
                      <table className={panelListDenseTableClass}>
                        <thead className={panelListDenseTheadClass}>
                          <tr>
                            <th className={operationalCheckboxColumnHeaderClass}>
                              <span className="sr-only">Zaznacz</span>
                            </th>
                            <th className={operationalActionsColumnHeaderClass}>Akcje</th>
                            <th className={`${panelListDenseThBase} text-left`}>Zwrot</th>
                            <th className={`${panelListDenseThBase} text-left`}>Produkty</th>
                            <th className={`${panelListDenseThBase} text-left`}>Klient</th>
                            <th className={`${panelListDenseThBase} text-left`}>Kanał</th>
                            <th className={`${panelListDenseThBase} text-right`}>Wartość</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const lineCount = r.lines?.length ?? 0;
                            const previews = r.lines_preview ?? [];
                            const more = Math.max(0, lineCount - previews.length);
                            const custParts = [(r.first_name || "").trim(), (r.last_name || "").trim()].filter(Boolean);
                            const cust = custParts.length ? custParts.join(" ") : "—";
                            const srcDisp = normalizeOrderSourceDisplay(r.source);
                            const srcIsEmpty = srcDisp === "—";
                            const TD = panelListDenseTdBase;
                            const rowBusy = bulkSubmitting || deleteSubmitting;
                            const rowArchived = isReturnsListRowArchivedTone(r);
                            const displayLines = previews.map((pv) => ({
                              quantity: pv.quantity,
                              name: pv.name,
                              ean: pv.ean,
                              sku: pv.sku,
                              image_url: firstImageUrl(pv.image_url) ?? undefined,
                            }));
                            return (
                              <tr
                                key={r.id}
                                className={`${panelListDenseRowClass} ${rowArchived ? RETURNS_LIST_ROW_ARCHIVED_CLASS : ""} ${isRowSelected(String(r.id)) ? panelListDenseRowSelectedClass : ""}`}
                                onClick={() => openDetail(r.id)}
                              >
                                <td className={`${operationalCheckboxColumnCellClass} text-center`} onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isRowSelected(String(r.id))}
                                    disabled={rowBusy}
                                    onChange={(e) =>
                                      toggleOne(String(r.id), (e.nativeEvent as MouseEvent).shiftKey ?? false)
                                    }
                                    className={panelListDenseCheckboxInputClass}
                                    aria-label={`Zaznacz zwrot ${r.rmz_number}`}
                                  />
                                </td>
                                <td className={operationalActionsColumnCellClass} onClick={(e) => e.stopPropagation()}>
                                  <OperationalActionColumn
                                    aria-label="Akcje zwrotu"
                                    slots={[
                                      <OperationalActionLink
                                        key="eye"
                                        to={`/orders/returns/${r.id}`}
                                        title="Szczegóły"
                                        aria-label="Szczegóły zwrotu"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Eye className="text-slate-600" strokeWidth={2} aria-hidden />
                                      </OperationalActionLink>,
                                      <OperationalActionLink
                                        key="wms"
                                        to={WMS_ROUTES.returnsProcess(r.id)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Terminal WMS (nowa karta)"
                                        aria-label="Obsłuż zwrot w terminalu WMS"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="text-slate-600" strokeWidth={2} aria-hidden />
                                      </OperationalActionLink>,
                                      <OperationalActionButton
                                        key="del"
                                        variant="danger"
                                        title="Archiwizuj zwrot"
                                        aria-label="Archiwizuj zwrot"
                                        disabled={rowBusy}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setDeleteConfirm({ kind: "single", id: r.id });
                                        }}
                                      >
                                        <Trash2 strokeWidth={2} aria-hidden />
                                      </OperationalActionButton>,
                                    ]}
                                  />
                                </td>
                                <td className={`${TD} min-w-[14rem] align-top`}>
                                  <div className="flex flex-col gap-1.5 text-left">
                                    <div className="text-xs tabular-nums leading-snug text-slate-500">{formatReturnDate(r.created_at)}</div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openDetail(r.id);
                                      }}
                                      className="w-fit text-left text-sm font-semibold text-blue-600 hover:underline"
                                    >
                                      #{r.rmz_number}
                                    </button>
                                    <ReturnsListRowStatusBadges r={r} />
                                  </div>
                                </td>
                                <td className={`${TD} min-w-[12rem] whitespace-normal align-top`}>
                                  <PanelListDenseProductCell lines={displayLines} more={more} />
                                </td>
                                <td className={`${TD} min-w-[10rem] whitespace-normal break-words text-slate-800`}>{cust}</td>
                                <td className={TD}>
                                  <span
                                    className={`text-sm ${srcIsEmpty ? "text-slate-400" : "text-slate-800"}`}
                                    title={srcIsEmpty ? undefined : srcDisp}
                                  >
                                    {srcIsEmpty ? "—" : srcDisp}
                                  </span>
                                </td>
                                <td className={`${TD} text-right align-top`}>
                                  <div className="text-sm font-semibold tabular-nums text-slate-900">{panelListRefundTotalPln(r)}</div>
                                  <div className="mt-1 inline-flex max-w-full items-center rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 text-left text-[11px] font-semibold leading-tight text-slate-700">
                                    {returnTypeBadgeLabel(r.return_type)}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
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
