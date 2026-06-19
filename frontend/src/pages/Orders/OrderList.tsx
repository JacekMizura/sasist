import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  Home,
  LayoutGrid,
  Mail,
  MoreHorizontal,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Rows,
  Table2,
  Truck,
  Wrench,
} from "lucide-react";
import api from "../../api/axios";
import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { useWarehouse } from "../../context/WarehouseContext";
import type { OrderUiPanelSubgroupRead, OrderUiStatusBrief, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { usePanelListBulkSelection } from "../../hooks/usePanelListBulkSelection";
import { formatMoney } from "../../utils/formatOrderMoney";
import { getShippingMethods, type ShippingMethodDto } from "../../api/shippingMethodsApi";
import { OrderListFiltersPanel } from "../../components/orders/orderList/OrderListFiltersPanel";
import { OrderBulkMultiActionModal } from "../../components/orders/orderList/OrderBulkMultiActionModal";
import { OrderQuickActionModals } from "../../components/orders/orderList/OrderQuickActionModals";
import type { OrderQuickToolbarActionKind } from "../../components/orders/orderList/orderQuickActionKinds";
import { executeOrderBulkActions } from "../../components/orders/orderList/executeOrderBulkActions";
import {
  DEFAULT_APPLIED_ORDER_LIST_FILTERS,
  type AppliedOrderListFilters,
} from "../../components/orders/orderList/orderListFilterTypes";
import type { BulkActionConfig, BulkActionRow } from "../../components/orders/orderList/bulkMultiActionTypes";
import {
  postOrdersBulkDelete,
  postOrdersBulkPatch,
  type OrderBulkSelectionDto,
  type OrdersBulkDeleteResult,
} from "../../api/ordersBulkApi";
import { buildOrderBulkListFiltersPayload } from "../../utils/orderListBulkFilters";
import type { OrderListBulkSelectionArg } from "../../components/orders/orderList/executeOrderBulkActions";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { dispatchOrdersOperationsUpdated } from "../wms/wmsRoutes";
import { dispatchWmsShortagesUpdated } from "../../utils/wmsRefresh";
import { OrderStatusSidebar, type OrderPanelFilter } from "../../components/orders/OrderStatusSidebar";
import { deriveOrderListPaymentBadgeRow } from "../../utils/orderListPaymentBadge";
import ExportModal from "../../components/exports/ExportModal";
import { WMS_ROUTES } from "../wms/wmsRoutes";
import { ColumnSelectorModal } from "../../components/columnPicker";
import {
  loadColumnLayout,
  normalizeColumnOrder,
  ORDERS_COLUMNS_LAYOUT_KEY,
  saveColumnLayout,
} from "../../preferences/columnLayoutPreferences";
import {
  migrateOrderListColumnIds,
  ORDER_LIST_DEFAULT_TABLE_COLUMN_ORDER,
  ORDER_LIST_TABLE_COLUMN_CATALOG,
  ORDER_LIST_USER_COLUMN_IDS,
} from "../../components/orders/orderList/orderListColumnCatalog";
import { OrderListDenseTable } from "../../components/orders/orderList/OrderListDenseTable";
import {
  OrderListQuickNoteModal,
  type QuickNoteAudience,
} from "../../components/orders/orderList/OrderListQuickNoteModal";
import { OrderBulkCustomFieldModal } from "../../components/orders/orderList/OrderBulkCustomFieldModal";
import {
  OrderListMultiActionsMenu,
  type MultiMenuActionId,
} from "../../components/orders/orderList/OrderListMultiActionsMenu";
import {
  listSellasistInputClass,
  listSellasistTitleAddBtn,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";

/** Square bulk-toolbar icon buttons — shared across the Sellasist strip. */
const bulkIconBtnClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-none transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30";

type OrderListItemPreview = {
  quantity: number;
  name?: string | null;
  ean?: string | null;
  sku?: string | null;
  image_url?: string | null;
};

type Order = {
  id: number;
  number?: string;
  status?: string;
  created_at?: string | null;
  order_date?: string | null;
  total_volume?: number | null;
  is_multi_item?: boolean;
  total_items?: number;
  position_count?: number;
  value?: number | null;
  gross_profit?: number | null;
  margin_percent?: number | null;
  currency?: string | null;
  shipping_method_id?: string | null;
  shipping_method?: string | null;
  shipping_method_logo_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  items_preview?: OrderListItemPreview[];
  /** Wszystkie aktywne linie (lista + tooltip „+N poz.”). */
  items_display_lines?: OrderListItemPreview[];
  /** Lines with WMS missing qty > 0 (from list API). */
  wms_missing_line_count?: number;
  order_ui_status?: OrderUiStatusBrief | null;
  panel_payment_status?: string | null;
  panel_payment_method?: string | null;
  priority_color?: string | null;
  wms_packed_at?: string | null;
  wms_packed_by_label?: string | null;
  wms_workflow_phase?: string | null;
  has_internal_note?: boolean;
  has_customer_comment?: boolean;
  latest_internal_note_preview?: string | null;
  latest_customer_comment_preview?: string | null;
};

function formatOrderDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}

function customerLabel(o: Order): string {
  const parts = [o.first_name?.trim(), o.last_name?.trim()].filter(Boolean);
  if (parts.length) return parts.join(" ");
  if (o.city?.trim()) return o.city.trim();
  return "—";
}

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100, 200, 500] as const;
type SortKey =
  | "id"
  | "number"
  | "status"
  | "order_date"
  | "total_volume"
  | "order_type"
  | "total_items"
  | "gross_profit"
  | "margin_percent";

export default function OrderList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { warehouses } = useWarehouse();

  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("order_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [appliedFilters, setAppliedFilters] = useState<AppliedOrderListFilters>(DEFAULT_APPLIED_ORDER_LIST_FILTERS);
  const [draftFilters, setDraftFilters] = useState<AppliedOrderListFilters>(DEFAULT_APPLIED_ORDER_LIST_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return localStorage.getItem("orders.list.filtersExpanded") === "1";
    } catch {
      return false;
    }
  });
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodDto[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [multiModalOpen, setMultiModalOpen] = useState(false);
  const [multiBusy, setMultiBusy] = useState(false);
  const [quickModal, setQuickModal] = useState<OrderQuickToolbarActionKind | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [isStatusPanelCollapsed, setIsStatusPanelCollapsed] = useState(false);
  const openFilterFieldsRef = useRef<(() => void) | null>(null);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickNoteBusy, setQuickNoteBusy] = useState(false);
  const [quickNoteSelection, setQuickNoteSelection] = useState<OrderBulkSelectionDto | null>(null);
  const [quickNoteCount, setQuickNoteCount] = useState(0);
  const [customFieldModalOpen, setCustomFieldModalOpen] = useState(false);
  const [tableDensityCompact, setTableDensityCompact] = useState(false);

  const [columnOrder, setColumnOrder] = useState<string[]>(() =>
    loadColumnLayout(ORDERS_COLUMNS_LAYOUT_KEY, ORDER_LIST_USER_COLUMN_IDS, ORDER_LIST_DEFAULT_TABLE_COLUMN_ORDER, {
      migrate: migrateOrderListColumnIds,
    }),
  );

  const persistColumnOrder = useCallback((next: string[]) => {
    const normalized = normalizeColumnOrder(next, ORDER_LIST_USER_COLUMN_IDS, ORDER_LIST_DEFAULT_TABLE_COLUMN_ORDER);
    setColumnOrder(normalized);
    saveColumnLayout(ORDERS_COLUMNS_LAYOUT_KEY, normalized);
  }, []);

  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[] | null>(null);
  const [panelFilter, setPanelFilter] = useState<OrderPanelFilter>("all");

  /** Optional user filter — never derived from global WMS warehouse selector. */
  const fulfillmentWarehouseFilter = appliedFilters.warehouseIdOverride;

  const appliedFiltersKey = useMemo(() => JSON.stringify(appliedFilters), [appliedFilters]);

  const loadPanelSummary = useCallback(async () => {
    try {
      const wh = fulfillmentWarehouseFilter;
      const [s, sg] = await Promise.all([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID, wh),
        wh != null ? getOrderPanelSubgroups(DAMAGE_TENANT_ID, wh) : Promise.resolve(null),
      ]);
      setPanelSummary(s);
      setPanelSubgroups(sg);
    } catch {
      setPanelSummary(null);
      setPanelSubgroups(null);
    }
  }, [fulfillmentWarehouseFilter]);

  useEffect(() => {
    void loadPanelSummary();
  }, [loadPanelSummary]);

  useEffect(() => {
    if (panelFilter !== "unassigned") return;
    if (panelSummary != null && panelSummary.unassigned_count === 0) {
      setPanelFilter("all");
    }
  }, [panelFilter, panelSummary]);

  useEffect(() => {
    const wh = appliedFilters.warehouseIdOverride;
    if (wh != null) {
      void getShippingMethods({ tenant_id: DAMAGE_TENANT_ID, warehouse_id: wh, active_only: true })
        .then(setShippingMethods)
        .catch(() => setShippingMethods([]));
      return;
    }
    if (warehouses.length === 0) {
      setShippingMethods([]);
      return;
    }
    void Promise.all(
      warehouses.map((w) =>
        getShippingMethods({ tenant_id: DAMAGE_TENANT_ID, warehouse_id: w.id, active_only: true }).catch(() => []),
      ),
    )
      .then((arrays) => {
        const seen = new Set<string>();
        const merged: ShippingMethodDto[] = [];
        for (const arr of arrays) {
          for (const m of arr) {
            if (!seen.has(m.id)) {
              seen.add(m.id);
              merged.push(m);
            }
          }
        }
        setShippingMethods(merged);
      })
      .catch(() => setShippingMethods([]));
  }, [appliedFilters.warehouseIdOverride, warehouses]);

  useEffect(() => {
    setPage(1);
  }, [panelFilter, appliedFiltersKey]);

  const appliedListLocationFilter = useRef(false);
  useEffect(() => {
    if (appliedListLocationFilter.current) return;
    const st = location.state as { panelFilter?: OrderPanelFilter } | null | undefined;
    if (st?.panelFilter != null) {
      appliedListLocationFilter.current = true;
      setPanelFilter(st.panelFilter);
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  const visibleOrderIds = useMemo(() => orders.map((o) => String(o.id)), [orders]);
  const orderBulkFiltersPayload = useMemo(
    () => buildOrderBulkListFiltersPayload(appliedFilters, panelFilter),
    [appliedFilters, panelFilter],
  );
  const {
    selectedIds,
    bulkSelectionMode,
    effectiveSelectionCount,
    selectAllFiltered,
    selectAllOnPage,
    toggleOne,
    clearSelection,
    selectOnly,
    headerChecked,
    headerIndeterminate,
    isRowSelected,
  } = usePanelListBulkSelection({
    visibleIds: visibleOrderIds,
    clearOnDeps: [page, panelFilter, fulfillmentWarehouseFilter, rowsPerPage, appliedFiltersKey, sortBy, sortDir],
    serverFilteredTotal: totalCount,
  });

  const orderListBulkSelectionArg = useCallback((): OrderListBulkSelectionArg => {
    if (bulkSelectionMode === "filtered_all") {
      return { mode: "filtered_query", filters: orderBulkFiltersPayload };
    }
    return { mode: "explicit_ids", orderIds: selectedIds };
  }, [bulkSelectionMode, orderBulkFiltersPayload, selectedIds]);

  const toBulkSelectionDto = useCallback((): OrderBulkSelectionDto | null => {
    if (bulkSelectionMode === "filtered_all") {
      return { mode: "filtered_query", filters: orderBulkFiltersPayload };
    }
    const ids = selectedIds.map((s) => Number(s)).filter((n) => Number.isFinite(n));
    return { mode: "explicit_ids", ids };
  }, [bulkSelectionMode, orderBulkFiltersPayload, selectedIds]);

  const [bulkSelectMenuKey, setBulkSelectMenuKey] = useState(0);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    const params = new URLSearchParams({
      tenant_id: String(DAMAGE_TENANT_ID),
      limit: String(rowsPerPage),
      offset: String((page - 1) * rowsPerPage),
      sort_by: sortBy,
      sort_dir: sortDir,
    });
    if (fulfillmentWarehouseFilter != null) {
      params.set("warehouse_id", String(fulfillmentWarehouseFilter));
    }

    const af = appliedFilters;
    if (af.search.trim()) params.set("search", af.search.trim());
    if (af.orderType.trim()) params.set("order_type", af.orderType.trim());
    if (af.dateFrom.trim()) params.set("date_from", af.dateFrom.trim());
    if (af.dateTo.trim()) params.set("date_to", af.dateTo.trim());
    if (af.shippingMethodId.trim()) params.set("filter_shipping_method_id", af.shippingMethodId.trim());
    if (af.sourceContains.trim()) params.set("source_contains", af.sourceContains.trim());
    const vmin = parseFloat(af.valueMin);
    if (!Number.isNaN(vmin) && af.valueMin.trim() !== "") params.set("order_value_min", String(vmin));
    const vmax = parseFloat(af.valueMax);
    if (!Number.isNaN(vmax) && af.valueMax.trim() !== "") params.set("order_value_max", String(vmax));

    if (af.panelStatusIds.length > 0) {
      params.set("panel_order_ui_status_ids", af.panelStatusIds.join(","));
    } else if (panelFilter === "unassigned") {
      params.set("panel_order_ui_unassigned", "true");
    } else if (typeof panelFilter === "object" && panelFilter.kind === "sub") {
      params.set("panel_order_ui_status_id", String(panelFilter.id));
    } else if (typeof panelFilter === "object" && panelFilter.kind === "group") {
      params.set("panel_order_ui_main_group", panelFilter.group);
    }

    if (af.paidOnly) params.set("paid_only", "true");
    if (af.unpaidOnly) params.set("unpaid_only", "true");
    if (!af.paidOnly && !af.unpaidOnly && af.paymentStatus.trim()) {
      params.set("payment_status", af.paymentStatus.trim());
    }
    if (af.withDocument) params.set("with_document", "true");
    if (af.withoutDocument) params.set("without_document", "true");
    if (af.includeArchived) params.set("include_archived", "true");
    if (af.directSalesOnly) params.set("order_channel", "DIRECT_SALE");
    if (af.immediateFulfillmentOnly) params.set("fulfillment_mode", "IMMEDIATE");

    api
      .get(`/orders/?${params.toString()}`)
      .then((res) => {
        const data = res.data;
        const list = Array.isArray(data) ? data : [];
        setOrders(list);
        const totalHeader = res.headers?.["x-total-count"];
        setTotalCount(totalHeader != null ? parseInt(String(totalHeader), 10) : list.length);
      })
      .catch((err) => {
        setOrders([]);
        setFetchError(err?.message ?? "Błąd pobierania listy zamówień");
      })
      .finally(() => setLoading(false));
  }, [
    fulfillmentWarehouseFilter,
    page,
    rowsPerPage,
    appliedFilters,
    sortBy,
    sortDir,
    panelFilter,
  ]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const openOrder = (orderId: number) => {
    const orderNavIds = orders.map((o) => o.id);
    navigate(`/orders/${orderId}`, { state: { orderNavIds } });
  };

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir(key === "order_date" ? "desc" : "asc");
    }
  };

  const bulkDelete = async () => {
    if (effectiveSelectionCount === 0) return;
    const bulkWh = requireFulfillmentWarehouseForBulk();
    if (bulkWh == null) return;
    const n = effectiveSelectionCount;
    setDeleting(true);
    try {
      let summary: OrdersBulkDeleteResult | null = null;
      if (bulkSelectionMode === "filtered_all") {
        summary = await postOrdersBulkDelete({
          tenant_id: DAMAGE_TENANT_ID,
          warehouse_id: bulkWh,
          selection: { mode: "filtered_query", filters: orderBulkFiltersPayload },
        });
      } else {
        const baseURL = api.defaults.baseURL;
        if (!baseURL) {
          console.error("[OrderList] VITE_API_URL is not set; cannot call bulk delete.");
          return;
        }
        const res = await axios.delete<OrdersBulkDeleteResult>(
          `${String(baseURL).replace(/\/$/, "")}/orders/bulk?tenant_id=${DAMAGE_TENANT_ID}&warehouse_id=${bulkWh}&ids=${selectedIds.join(",")}`
        );
        summary = res.data;
      }
      clearSelection();
      setBulkSelectMenuKey((k) => k + 1);
      fetchOrders();
      void loadPanelSummary();
      dispatchWmsShortagesUpdated();
      dispatchOrdersOperationsUpdated();
      if (summary) {
        if (summary.messages && summary.messages.length > 0) {
          setToast(summary.messages.join(" · "));
        } else {
          const soft = summary.soft_deleted_count ?? 0;
          const friendlyFk =
            "Niektóre zamówienia mają powiązaną historię (zwroty/reklamacje), więc zostały zarchiwizowane zamiast usunięte.";
          const errLines = (summary.errors ?? []).map((e) => {
            const s = String(e);
            const low = s.toLowerCase();
            if (low.includes("naruszenie") || low.includes("foreign key") || low.includes("integrity")) {
              return friendlyFk;
            }
            return s;
          });
          const parts = [
            `Usunięto: ${summary.deleted_count ?? summary.deleted ?? 0}`,
            soft > 0 ? `Zarchiwizowano: ${soft}` : null,
            summary.blocked_count ? `zablokowane: ${summary.blocked_count}` : null,
            summary.skipped_not_found ? `pominięto (brak w magazynie): ${summary.skipped_not_found}` : null,
            errLines.length ? `Błędy: ${errLines.join("; ")}` : null,
          ].filter(Boolean);
          setToast(parts.join(" · "));
        }
      } else {
        setToast(`Usunięto ${n} zamówień.`);
      }
    } catch (e) {
      console.error(e);
      setFetchError((e as Error)?.message ?? "Błąd usuwania zamówień");
    } finally {
      setDeleting(false);
    }
  };

  const toggleFiltersPanel = () => {
    setFiltersExpanded((prev) => {
      const n = !prev;
      try {
        localStorage.setItem("orders.list.filtersExpanded", n ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (n) setDraftFilters({ ...appliedFilters });
      return n;
    });
  };

  const applyFilterDraft = () => {
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  };

  const clearAllFilters = () => {
    const z = { ...DEFAULT_APPLIED_ORDER_LIST_FILTERS };
    setDraftFilters(z);
    setAppliedFilters(z);
    setPage(1);
  };

  const openMultiModal = () => {
    setQuickModal(null);
    setMultiModalOpen(true);
  };

  const openMultiModalForOrder = (orderId: number) => {
    selectOnly(String(orderId));
    setQuickModal(null);
    setMultiModalOpen(true);
  };

  const openQuickAction = (kind: OrderQuickToolbarActionKind) => {
    setMultiModalOpen(false);
    if (kind === "operational_notes") {
      const sel = toBulkSelectionDto();
      if (!sel || effectiveSelectionCount < 1) {
        setToast("Zaznacz zamówienia.");
        return;
      }
      setQuickNoteSelection(sel);
      setQuickNoteCount(effectiveSelectionCount);
      setQuickNoteOpen(true);
      return;
    }
    setQuickModal(kind);
  };

  const rowId = () => `quick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleQuickChangeStatus = async (statusId: string) => {
    if (effectiveSelectionCount === 0) return;
    const bulkWh = requireFulfillmentWarehouseForBulk();
    if (bulkWh == null) return;
    setQuickBusy(true);
    setFetchError(null);
    try {
      const { errors } = await executeOrderBulkActions({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: bulkWh,
        selection: orderListBulkSelectionArg(),
        rows: [{ id: rowId(), kind: "change_status", expanded: true }],
        config: { change_status: { statusId } },
      });
      if (errors.length) {
        setFetchError(errors.slice(0, 5).join(" · "));
        setToast(errors.length > 5 ? "Część operacji zakończona z błędami." : "Część operacji zakończona z błędami.");
      } else {
        setToast("Status zaktualizowany.");
        setQuickModal(null);
        clearSelection();
        setBulkSelectMenuKey((k) => k + 1);
      }
      fetchOrders();
      void loadPanelSummary();
    } catch {
      setFetchError("Operacja nie powiodła się.");
    } finally {
      setQuickBusy(false);
    }
  };

  const handleQuickIssueDocument = async (documentType: "INVOICE" | "PARAGON") => {
    if (effectiveSelectionCount === 0) return;
    const bulkWh = requireFulfillmentWarehouseForBulk();
    if (bulkWh == null) return;
    setQuickBusy(true);
    setFetchError(null);
    try {
      const { errors } = await executeOrderBulkActions({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: bulkWh,
        selection: orderListBulkSelectionArg(),
        rows: [{ id: rowId(), kind: "issue_document", expanded: true }],
        config: { issue_document: { documentType } },
      });
      if (errors.length) {
        setFetchError(errors.slice(0, 5).join(" · "));
        setToast(errors.length > 5 ? "Część operacji zakończona z błędami." : "Część operacji zakończona z błędami.");
      } else {
        setToast("Typ dokumentu zapisany.");
        setQuickModal(null);
        clearSelection();
        setBulkSelectMenuKey((k) => k + 1);
      }
      fetchOrders();
      void loadPanelSummary();
    } catch {
      setFetchError("Operacja nie powiodła się.");
    } finally {
      setQuickBusy(false);
    }
  };

  const handleQuickSetPriority = async (
    priorityColor: "gray" | "blue" | "green" | "yellow" | "orange" | "red" | null,
  ) => {
    if (effectiveSelectionCount === 0) return;
    const bulkWh = requireFulfillmentWarehouseForBulk();
    if (bulkWh == null) return;
    setQuickBusy(true);
    setFetchError(null);
    try {
      const { errors } = await executeOrderBulkActions({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: bulkWh,
        selection: orderListBulkSelectionArg(),
        rows: [{ id: rowId(), kind: "set_priority", expanded: true }],
        config: { set_priority: { priorityColor } },
      });
      if (errors.length) {
        setFetchError(errors.slice(0, 5).join(" · "));
        setToast(errors.length > 5 ? "Część operacji zakończona z błędami." : "Część operacji zakończona z błędami.");
      } else {
        setToast("Priorytet zapisany.");
        setQuickModal(null);
        clearSelection();
        setBulkSelectMenuKey((k) => k + 1);
      }
      fetchOrders();
      void loadPanelSummary();
    } catch {
      setFetchError("Operacja nie powiodła się.");
    } finally {
      setQuickBusy(false);
    }
  };

  const handleQuickAddNote = async (text: string) => {
    if (effectiveSelectionCount === 0) return;
    const bulkWh = requireFulfillmentWarehouseForBulk();
    if (bulkWh == null) return;
    const tx = text.trim();
    if (!tx) return;
    setQuickBusy(true);
    setFetchError(null);
    try {
      const { errors } = await executeOrderBulkActions({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: bulkWh,
        selection: orderListBulkSelectionArg(),
        rows: [{ id: rowId(), kind: "add_note", expanded: true }],
        config: { add_note: { text: tx } },
      });
      if (errors.length) {
        setFetchError(errors.slice(0, 5).join(" · "));
        setToast(errors.length > 5 ? "Część operacji zakończona z błędami." : "Część operacji zakończona z błędami.");
      } else {
        setToast("Notatka dopisana.");
        setQuickModal(null);
        clearSelection();
        setBulkSelectMenuKey((k) => k + 1);
      }
      fetchOrders();
      void loadPanelSummary();
    } catch {
      setFetchError("Operacja nie powiodła się.");
    } finally {
      setQuickBusy(false);
    }
  };

  const handleQuickPaymentStatus = async (paymentStatus: string | null) => {
    if (effectiveSelectionCount === 0) return;
    const bulkWh = requireFulfillmentWarehouseForBulk();
    if (bulkWh == null) return;
    const sel = toBulkSelectionDto();
    if (!sel) return;
    setQuickBusy(true);
    setFetchError(null);
    try {
      await postOrdersBulkPatch({
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: bulkWh,
        selection: sel,
        payment_status: paymentStatus === null ? "" : paymentStatus,
      });
      setToast("Status płatności zaktualizowany.");
      setQuickModal(null);
      clearSelection();
      setBulkSelectMenuKey((k) => k + 1);
      fetchOrders();
      void loadPanelSummary();
    } catch {
      setFetchError("Operacja nie powiodła się.");
    } finally {
      setQuickBusy(false);
    }
  };

  const onBulkCustomFieldApplied = useCallback(() => {
    setToast("Pola dodatkowe zaktualizowane.");
    clearSelection();
    setBulkSelectMenuKey((k) => k + 1);
    fetchOrders();
    void loadPanelSummary();
  }, [clearSelection, fetchOrders, loadPanelSummary]);

  const onBulkCustomFieldError = useCallback((msg: string) => {
    setFetchError(msg);
  }, []);

  const submitQuickNote = async ({
    audience,
    text,
  }: {
    audience: QuickNoteAudience;
    text: string;
  }) => {
    if (quickNoteSelection == null) return;
    const bulkWh = requireFulfillmentWarehouseForBulk();
    if (bulkWh == null) return;
    setQuickNoteBusy(true);
    setFetchError(null);
    try {
      const base = {
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: bulkWh,
        selection: quickNoteSelection,
      };
      if (audience === "internal") {
        await postOrdersBulkPatch({ ...base, internal_note_append: text });
      } else if (audience === "customer") {
        await postOrdersBulkPatch({ ...base, customer_note_append: text });
      } else {
        await postOrdersBulkPatch({ ...base, operational_note_append: text });
      }
      setToast("Notatka dodana.");
      clearSelection();
      setBulkSelectMenuKey((k) => k + 1);
      fetchOrders();
      void loadPanelSummary();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Nie udało się zapisać notatki.";
      setFetchError(msg);
      throw e;
    } finally {
      setQuickNoteBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const startRow = totalCount === 0 ? 0 : (page - 1) * rowsPerPage + 1;
  const endRow = Math.min(page * rowsPerPage, totalCount);

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

  const bulkBusy = multiBusy || quickBusy || deleting || quickNoteBusy;
  const bulkToolbarDisabled = bulkBusy || effectiveSelectionCount === 0;

  const requireFulfillmentWarehouseForBulk = (): number | null => {
    if (fulfillmentWarehouseFilter != null) return fulfillmentWarehouseFilter;
    setToast("Wybierz magazyn realizacji w filtrach, aby wykonać operacje masowe.");
    return null;
  };

  const handleMultiMenu = (id: MultiMenuActionId) => {
    const allowWithoutSelection =
      id === "packing_queue" || id === "export" || id === "print";
    if (!allowWithoutSelection && effectiveSelectionCount === 0) {
      setToast("Zaznacz zamówienia.");
      return;
    }
    switch (id) {
      case "change_status":
        openQuickAction("change_status");
        break;
      case "change_operator":
        setToast("Zmiana operatora — w przygotowaniu.");
        break;
      case "add_tag":
      case "remove_tag":
        setToast("Tagi zamówień — w przygotowaniu.");
        break;
      case "add_note": {
        const sel = toBulkSelectionDto();
        if (!sel) return;
        setQuickNoteSelection(sel);
        setQuickNoteCount(effectiveSelectionCount);
        setQuickNoteOpen(true);
        break;
      }
      case "change_shipping":
        openMultiModal();
        break;
      case "change_payment_status":
        openQuickAction("change_payment_status");
        break;
      case "packing_queue":
        navigate(WMS_ROUTES.packing);
        break;
      case "issue_document":
        openQuickAction("issue_document");
        break;
      case "print":
        setToast("Drukowanie — w przygotowaniu.");
        break;
      case "export":
        setExportOpen(true);
        break;
      case "custom_field_value":
        if (bulkSelectionMode === "filtered_all") {
          setToast("Ta akcja wymaga zaznaczenia rekordów na stronie (nie „wszystkie z filtra”).");
          return;
        }
        if (requireFulfillmentWarehouseForBulk() == null) return;
        setCustomFieldModalOpen(true);
        break;
      case "delete":
        void bulkDelete();
        break;
      case "archive":
        setToast("Archiwizacja zbiorcza — w przygotowaniu.");
        break;
      default:
        break;
    }
  };

  const handleMultiExecute = async (payload: { rows: BulkActionRow[]; config: BulkActionConfig }) => {
    if (effectiveSelectionCount === 0) return;
    const bulkWh = requireFulfillmentWarehouseForBulk();
    if (bulkWh == null) return;
    for (const row of payload.rows) {
      if (row.kind === "change_status") {
        const sid = (payload.config.change_status?.statusId ?? "").trim();
        if (sid === "") {
          setFetchError("W sekcji „Zmień status” wybierz status lub opcję wyczyszczenia.");
          return;
        }
      }
      if (row.kind === "change_shipping") {
        const sm = (payload.config.change_shipping?.shippingMethodId ?? "").trim();
        if (sm === "") {
          setFetchError("W sekcji „Zmień metodę dostawy” wybierz metodę.");
          return;
        }
      }
      if (row.kind === "add_note") {
        const tx = (payload.config.add_note?.text ?? "").trim();
        if (!tx) {
          setFetchError("W sekcji „Dodaj notatkę” wpisz treść.");
          return;
        }
      }
    }
    setMultiBusy(true);
    setFetchError(null);
    try {
      const { errors } = await executeOrderBulkActions({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId: bulkWh,
        selection: orderListBulkSelectionArg(),
        rows: payload.rows,
        config: payload.config,
      });
      if (errors.length) {
        setFetchError(errors.slice(0, 5).join(" · "));
        setToast(errors.length > 5 ? "Część operacji zakończona z błędami." : "Część operacji zakończona z błędami.");
      } else {
        setToast("Multiakcje zakończone pomyślnie.");
        setMultiModalOpen(false);
        clearSelection();
        setBulkSelectMenuKey((k) => k + 1);
      }
      fetchOrders();
      void loadPanelSummary();
    } catch {
      setFetchError("Wykonanie multiakcji nie powiodło się.");
    } finally {
      setMultiBusy(false);
    }
  };

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
          <span className="font-medium text-slate-600">Lista</span>
        </nav>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
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
                    warehouseId={fulfillmentWarehouseFilter}
                    panelSummary={panelSummary}
                    panelSubgroups={panelSubgroups}
                    panelFilter={panelFilter}
                    onPanelFilterChange={setPanelFilter}
                    chromeVariant="sellasist"
                    collapsed={isStatusPanelCollapsed}
                    parentScrollContainer
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
                        warehouseId={fulfillmentWarehouseFilter}
                        panelSummary={panelSummary}
                        panelSubgroups={panelSubgroups}
                        panelFilter={panelFilter}
                        onPanelFilterChange={(f) => {
                          setPanelFilter(f);
                          setStatusDrawerOpen(false);
                        }}
                        chromeVariant="sellasist"
                      />
                    </div>
                  </div>
                ) : null}
              </>

            <div className="flex min-w-0 flex-1 flex-col space-y-3">
              <div className="flex min-h-9 flex-nowrap items-center gap-2">
                <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                  Zamówienia
                  {!loading ? <span className="font-normal text-slate-500"> ({totalCount} wyników)</span> : null}
                </h1>
                <Link
                  to="/orders/new"
                  className={`${listSellasistTitleAddBtn} !h-9 !w-9`}
                  title="Nowe zamówienie"
                  aria-label="Nowe zamówienie"
                >
                  <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                </Link>
              </div>

              {fetchError && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{fetchError}</div>
              )}

              <OrderListFiltersPanel
                expanded={filtersExpanded}
                onToggleExpanded={toggleFiltersPanel}
                draft={draftFilters}
                onChangeDraft={(patch) => setDraftFilters((d) => ({ ...d, ...patch }))}
                onApply={applyFilterDraft}
                onClear={clearAllFilters}
                panelSummary={panelSummary}
                warehouses={warehouses}
                shippingMethods={shippingMethods}
                filterLayout="embedded"
                openFilterFieldsRef={openFilterFieldsRef}
              />

              {bulkSelectionMode === "filtered_all" && (
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
              )}

              {loading ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Ładowanie…
                </div>
              ) : (
                <div className="min-w-0 overflow-hidden">
                  {!loading ? (
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-slate-100 pb-2 pt-0.5">
                      <div className="flex min-w-0 flex-[1.2] flex-wrap items-center gap-2">
                        <select
                          key={bulkSelectMenuKey}
                          defaultValue=""
                          disabled={bulkBusy}
                          aria-label="Zakres zaznaczenia na liście zamówień"
                          className={`${listSellasistInputClass} !h-8 max-w-[11rem] shrink-0 text-sm`}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "page") selectAllOnPage();
                            else if (v === "filtered") selectAllFiltered();
                            else if (v === "clear") {
                              clearSelection();
                              setBulkSelectMenuKey((k) => k + 1);
                            }
                            e.target.value = "";
                          }}
                        >
                          <option value="">Zaznacz…</option>
                          <option value="page">Strona</option>
                          <option value="filtered" disabled={totalCount < 1}>
                            Filtry ({totalCount})
                          </option>
                          <option value="clear">Odznacz</option>
                        </select>
                        <span className="text-xs tabular-nums text-slate-600" aria-live="polite">
                          {effectiveSelectionCount} zazn.
                          {(headerChecked || headerIndeterminate) && bulkSelectionMode === "filtered_all"
                            ? " · pełny zbiór"
                            : null}
                        </span>
                        <OrderListMultiActionsMenu
                          disabled={bulkBusy}
                          onSelect={handleMultiMenu}
                        />
                      </div>
                      <div className="flex flex-[1] flex-wrap items-center justify-center gap-1">
                        <button
                          type="button"
                          disabled={bulkToolbarDisabled}
                          className={bulkIconBtnClass}
                          title="Zmień status"
                          aria-label="Zmień status"
                          onClick={() => openQuickAction("change_status")}
                        >
                          <Flag className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={bulkToolbarDisabled}
                          className={bulkIconBtnClass}
                          title="Wystaw dokument"
                          aria-label="Wystaw dokument"
                          onClick={() => openQuickAction("issue_document")}
                        >
                          <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={bulkToolbarDisabled}
                          className={bulkIconBtnClass}
                          title="Metoda wysyłki — multiakcje"
                          aria-label="Metoda wysyłki"
                          onClick={openMultiModal}
                        >
                          <Truck className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={bulkToolbarDisabled}
                          className={bulkIconBtnClass}
                          title="Wiadomość"
                          aria-label="Wyślij wiadomość"
                          onClick={() => openQuickAction("send_message")}
                        >
                          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={bulkToolbarDisabled}
                          className={bulkIconBtnClass}
                          title="Eksportuj"
                          aria-label="Eksportuj"
                          onClick={() => setExportOpen(true)}
                        >
                          <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={bulkBusy}
                          className={bulkIconBtnClass}
                          title="Odśwież"
                          aria-label="Odśwież listę"
                          onClick={() => void fetchOrders()}
                        >
                          <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </button>
                        <Link
                          to={WMS_ROUTES.packing}
                          className={`${bulkIconBtnClass} no-underline`}
                          title="Pakowanie WMS"
                          aria-label="Pakowanie WMS"
                        >
                          <Package className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </Link>
                      </div>
                      <div className="flex flex-[1] flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={toggleFiltersPanel}
                          className={`${listSellasistToolbarToggleBtn} !h-8 whitespace-nowrap px-2 text-xs`}
                          aria-expanded={filtersExpanded}
                        >
                          {filtersExpanded ? "Ukryj filtry" : "Filtry"}
                          <ChevronDown
                            className={`h-3.5 w-3.5 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
                            aria-hidden
                          />
                        </button>
                        <button
                          type="button"
                          className={`${listSellasistToolbarSquareBtn} !h-8 !w-8`}
                          title="Sortowanie — nagłówki kolumn"
                          aria-label="Sortowanie listy"
                        >
                          <ArrowUpDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setColumnPickerOpen(true)}
                          className={`${listSellasistToolbarSquareBtn} !h-8 !w-8`}
                          title="Widoki — kolumny"
                          aria-label="Widoki — kolumny"
                        >
                          <Table2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTableDensityCompact((v) => !v)}
                          className={`${listSellasistToolbarSquareBtn} !h-8 !w-8`}
                          title={tableDensityCompact ? "Rzadszy układ" : "Gęstszy układ"}
                          aria-label="Gęstość wierszy"
                        >
                          {tableDensityCompact ? (
                            <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                          ) : (
                            <Rows className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                          )}
                        </button>
                        <details className="group relative">
                          <summary
                            className={`${listSellasistToolbarSquareBtn} !h-8 !w-8 cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                            aria-label="Więcej opcji listy"
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
                            <button
                              type="button"
                              className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                              onClick={() => setExportOpen(true)}
                            >
                              Eksport zaznaczonych…
                            </button>
                          </div>
                        </details>
                        <Link
                          to="/settings/orders/ui-statuses"
                          className={`${listSellasistToolbarSquareBtn} !h-8 !w-8`}
                          title="Ustawienia statusów panelu"
                          aria-label="Ustawienia statusów panelu"
                        >
                          <Wrench className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        </Link>
                      </div>
                    </div>
                  ) : null}
                  {orders.length === 0 ? (
                    <div className="px-4 py-12 text-center text-sm text-slate-500">Brak zamówień do wyświetlenia.</div>
                  ) : (
                    <OrderListDenseTable
                      orders={orders}
                      columnOrder={columnOrder}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onToggleSort={toggleSort}
                      formatOrderDate={formatOrderDate}
                      formatMoney={formatMoney}
                      customerLabel={customerLabel}
                      deriveOrderListPaymentBadgeRow={deriveOrderListPaymentBadgeRow}
                      isRowSelected={isRowSelected}
                      toggleOne={toggleOne}
                      bulkBusy={bulkBusy}
                      densityCompact={tableDensityCompact}
                      openOrder={openOrder}
                      onRowQuickAction={(orderId, kind) => {
                        if (kind === "operational_notes") {
                          setQuickNoteSelection({ mode: "explicit_ids", ids: [orderId] });
                          setQuickNoteCount(1);
                          setQuickNoteOpen(true);
                          return;
                        }
                        selectOnly(String(orderId));
                        openQuickAction(kind);
                      }}
                      onRowOpenMulti={(orderId) => openMultiModalForOrder(orderId)}
                    />
                  )}
                  {totalCount > 0 ? (
                    <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
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
                  ) : null}
                </div>
              )}

              <ColumnSelectorModal
                open={columnPickerOpen}
                onClose={() => setColumnPickerOpen(false)}
                title="Wybór kolumn"
                catalog={ORDER_LIST_TABLE_COLUMN_CATALOG}
                selectedOrder={columnOrder}
                onChange={persistColumnOrder}
              />
            </div>
      </div>

      <OrderBulkMultiActionModal
        open={multiModalOpen}
        onClose={() => {
          if (!multiBusy) setMultiModalOpen(false);
        }}
        orderCount={effectiveSelectionCount}
        panelSummary={panelSummary}
        panelSubgroups={panelSubgroups}
        shippingMethods={shippingMethods}
        busy={multiBusy}
        onExecute={(payload) => void handleMultiExecute(payload)}
      />

      <OrderQuickActionModals
        modal={quickModal}
        orderCount={effectiveSelectionCount}
        panelSummary={panelSummary}
        panelSubgroups={panelSubgroups}
        busy={quickBusy}
        onClose={() => {
          if (!quickBusy) setQuickModal(null);
        }}
        onApplyChangeStatus={handleQuickChangeStatus}
        onApplySetPriority={handleQuickSetPriority}
        onApplyIssueDocument={handleQuickIssueDocument}
        onApplyAddNote={handleQuickAddNote}
        onApplyPaymentStatus={handleQuickPaymentStatus}
        onAcknowledgeStub={(message) => {
          setQuickModal(null);
          setToast(message);
        }}
      />

      <OrderListQuickNoteModal
        open={quickNoteOpen}
        orderCount={quickNoteCount}
        busy={quickNoteBusy}
        onClose={() => {
          if (!quickNoteBusy) setQuickNoteOpen(false);
        }}
        onSubmit={submitQuickNote}
      />

      {fulfillmentWarehouseFilter != null ? (
        <OrderBulkCustomFieldModal
          open={customFieldModalOpen}
          warehouseId={fulfillmentWarehouseFilter}
          orderIds={selectedIds.map((s) => Number(s)).filter((n) => Number.isFinite(n))}
          onClose={() => setCustomFieldModalOpen(false)}
          onApplied={onBulkCustomFieldApplied}
          onError={onBulkCustomFieldError}
        />
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[90] max-w-lg -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-950 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tenantId={DAMAGE_TENANT_ID}
        entityType="orders"
        selectedIds={selectedIds.length > 0 ? [...selectedIds] : []}
        fallbackIds={orders.map((o) => o.id)}
      />
    </>
  );
}
