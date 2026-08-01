import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Bookmark,
  Copy,
  Download,
  Eye,
  Files,
  AlertTriangle,
  HelpCircle,
  Home,
  Inbox,
  Link2,
  MessageSquare,
  MessageSquareWarning,
  Pin,
  User,
  Pencil,
  Printer,
  Settings,
  Trash2,
  RefreshCw,
  Shield,
  Truck,
  Upload,
  Video,
  Check,
  MapPin,
  Bot,
  ShoppingCart,
  Package,
  Activity,
  Info,
  Plus,
  Send,
  ExternalLink,
  MoreVertical
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../../api/axios";
import { extractApiErrorMessage } from "../../api/authApi";
import {
  deleteOrderDocument,
  deleteOrderItemLine,
  getOrderNotes,
  postOrderOperationalNote,
  getOrderWmsFulfillment,
  ORDER_DOCUMENT_MODAL_TYPES,
  patchOrder,
  uploadOrderDocument,
  type OrderPanelUploadDocumentType,
  type OrderNoteDto,
  type OrderOperationalNoteDto,
} from "../../api/ordersApi";
import { getBackendPublicOrigin } from "../../config/apiBase";
import { formatApiError } from "../../utils/apiErrorMessage";
import { isStationarySaleOrder, printButtonLabelPl } from "../../components/directSales/directSalesTerminology";
import { useDocumentTemplatePrint } from "../../hooks/useDocumentTemplatePrint";
import { saleKindFromSubtype, stockKindFromType } from "../../utils/documentTemplatePrint";
import { OrderDirectSalesBadge } from "../../components/orders/orderList/OrderDirectSalesBadge";
import ActivityLogPanel from "../../components/activityLog/ActivityLogPanel";
import { formatMoney } from "../../utils/formatOrderMoney";
import OrderAdditionalFieldsSection from "../../components/orders/OrderAdditionalFieldsSection";
import { buildOrderReplacementPairs } from "../../components/orders/buildOrderReplacementSummary";
import OrderReplaceProductModal from "../../components/orders/OrderReplaceProductModal";
import { fmtOmsQty } from "../../components/orders/omsFulfillmentLinePresentation";
import type { WmsPackingOrderCardApi, WmsPackingOrderLineApi } from "../../api/wmsPackingApi";
import OrderAddProductModal from "../../components/orders/OrderAddProductModal";
import OrderAddBundleModal from "../../components/orders/OrderAddBundleModal";
import OrderEditProductModal from "../../components/orders/OrderEditProductModal";
import { EditBuyerModal } from "../../components/orders/EditBuyerModal";
import { OrderPriorityFlamePicker } from "../../components/orders/OrderPriorityFlame";
import { OrderHistoryTimeline } from "../../components/orders/OrderHistoryTimeline";
import { WmsOrderValidationPanel } from "../../components/orders/WmsOrderValidationPanel";
import { buildOrderHistoryTimelineEvents } from "../../components/orders/orderHistoryTimelineModel";
import { getShippingMethods } from "../../api/shippingMethodsApi";
import { getOrderPanelSubgroups, getOrderUiStatusSummary, patchOrderUiStatus } from "../../api/orderUiStatusApi";
import type { OrderUiPanelSubgroupRead, OrderUiStatusBrief, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { tabsNavItemClassName } from "../../components/layout/TabsNav";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { OrderCustomerLinkPanel } from "../../components/customers/OrderCustomerLinkPanel";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";
import { ShippingMethodLogo } from "../../components/shipping/ShippingMethodLogo";
import NewComplaintWizard from "../Complaints/NewComplaintWizard";
import { OrderStatusSidebar, ORDERS_PANEL_GROUP_LABELS, type OrderPanelFilter } from "../../components/orders/OrderStatusSidebar";
import { OrderUiStatusConfigRowPresent } from "../../components/orders/orderList/OrderUiStatusConfigRowPresent";
import { OrderWmsOperationalBadge } from "../../components/orders/orderList/OrderWmsOperationalBadge";
import { shouldShowOrderWmsOperationalBadge } from "../../utils/orderWmsOperationalBadgeVisibility";
import { OrderMatchedPackagingSection } from "../../components/orders/OrderMatchedPackagingSection";
import { OrderDetailInfoColumn } from "../../components/orders/OrderDetailInfoColumn";
import { odInlineIconBtnClass } from "../../components/orders/orderDetailUiTokens";
import {
  OrderSummaryProductsList,
  type OrderSummaryLineMenuAction,
  type OrderSummaryProductItem,
  type OrderSummaryProductsListLine,
} from "../../components/orders/OrderSummaryProductsList";
import { OrderWarehouseProductsSection as ImportedWarehouseSection } from "../../components/orders/OrderWarehouseProductsSection";
import { OrderDetailHeaderBar } from "../../components/orders/OrderDetailHeaderBar";
import { OrderCaseCreateView, type OrderCaseKind } from "../../components/orders/caseCreate";
import { OrderDetailSummaryTab } from "../../components/orders/OrderDetailSummaryTab";
import { OrderDetailCommsTab } from "../../components/orders/OrderDetailCommsTab";
import { WmsOperationTimesKpiPanel } from "../../components/orders/WmsOperationTimesKpiPanel";
import { DETAIL_TABS, type DetailTabId } from "../../components/orders/orderDetailTabs";
import { odMainHorizontalPadClass, odMainMaxWidthClass } from "../../components/orders/orderDetailUiTokens";
import {
  type OrderDetail,
  type OrderItemRow,
  PAYMENT_METHOD_PRESETS,
  PAYMENT_STATUS_PRESETS,
} from "../../components/orders/orderDetailPageTypes";
import {
  paymentStatusIsPaid,
  parseBillingInvoice,
  parsePhoneEmail,
  parseShippingAddressBlock,
  parseShippingExtras,
  shippingFromOrderJson,
  type ShippingAddrDraft,
} from "../../utils/orderDetailAddress";
import {
  orderDocKindToneClass,
  orderDocRowIsPdfOrImage,
  orderDocumentTypeToLabel,
  guessMimeFromFilename,
  ORDER_DOCS_SECTION_TYPES,
  type OrderDocTableRow,
} from "../../components/orders/docs/orderDocTableTypes";
import { OrderDocFilesTableSection } from "../../components/orders/docs/OrderDocFilesTableSection";
import {
  buildLogicalOrderItemGroups,
  countDistinctLogicalHistoryEvents,
  isLogicalOrderGroupVisible,
  type LogicalOrderItemMember,
} from "../../components/orders/logicalOrderItems";
import {
  findOrderItemForMenuAction,
  orderLineMenuLockedMessage,
} from "../../components/orders/orderLineMenuAction";
import { ConfirmModal } from "../../components/ui/ConfirmModal";
import type { PanelConfigurableUiStatusBrief } from "../../utils/panelListStatusBriefMappers";
import { WMS_ROUTES, WMS_SHORTAGES_UPDATED_EVENT } from "../wms/wmsRoutes";
import { dispatchWmsShortagesUpdated } from "../../utils/wmsRefresh";
import { AppOverlayPortal } from "../../components/overlay";

function formatDetailDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return "—";
  }
}

function formatDocsShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "—";
  }
}

function parseDecimalDraft(value: string): number | null {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatOrderExternalIdSnippet(order: Pick<OrderDetail, "scan_code" | "id">): string {
  const raw = (order.scan_code ?? "").trim();
  const ext = raw || `OMS:${order.id}`;
  if (ext.length <= 24) return ext;
  return `${ext.slice(0, 8)}…${ext.slice(-4)}`;
}

function formatLineDiscountLabel(it: OrderItemRow): string {
  const lp = it.list_price;
  const up = it.unit_price;
  if (lp == null || up == null || !Number.isFinite(Number(lp)) || !Number.isFinite(Number(up))) return "—";
  if (Number(lp) <= Number(up) + 1e-6) return "—";
  const pct = Math.round(((Number(lp) - Number(up)) / Number(lp)) * 100);
  return `${pct}%`;
}

function formatDurationFromSeconds(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) < 0) return "—";
  const s = Math.floor(Number(sec));
  if (s < 60) return `${s}s`;
  const totalMin = Math.floor(s / 60);
  const h = Math.floor(totalMin / 60);
  if (h > 0) {
    const mm = totalMin % 60;
    return `${h} h ${mm} min`;
  }
  const rs = s % 60;
  return rs > 0 ? `${totalMin} min ${rs}s` : `${totalMin} min`;
}

function formatLineVatDisplay(it: Pick<OrderItemRow, "vat_percent">): string {
  const v = it.vat_percent;
  if (v != null && Number.isFinite(Number(v))) {
    const n = Number(v);
    if (Math.abs(n - Math.round(n)) < 1e-6) return `${Math.round(n)}%`;
    return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%`;
  }
  return "—";
}

function pickFirstFinite(...vals: (number | null | undefined)[]): number | null {
  for (const v of vals) {
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function orderOfficePinStorageKey(orderId: number): string {
  return `order_office_pin:${orderId}`;
}

type OrderDocModalType = (typeof ORDER_DOCUMENT_MODAL_TYPES)[number];
const DEFAULT_DOC_MODAL_TYPE: OrderDocModalType = "FAKTURA";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[] | null>(null);
  const [panelSaving, setPanelSaving] = useState(false);
  const [caseCreateKind, setCaseCreateKind] = useState<OrderCaseKind | null>(null);
  const [complaintWizardOpen, setComplaintWizardOpen] = useState(false);
  const [complaintPrefillItemIds, setComplaintPrefillItemIds] = useState<number[] | undefined>(undefined);
  const [shippingMethods, setShippingMethods] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  const [shipDraft, setShipDraft] = useState("");
  const [shipPaySaving, setShipPaySaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [orderNotes, setOrderNotes] = useState<OrderNoteDto[]>([]);
  const [payMethodDraft, setPayMethodDraft] = useState("");
  const [payStatusDraft, setPayStatusDraft] = useState("");
  const [editBuyerModalOpen, setEditBuyerModalOpen] = useState(false);
  const [addressEditing, setAddressEditing] = useState(false);
  const [addrDraft, setAddrDraft] = useState<ShippingAddrDraft>({
    name: "",
    street: "",
    city: "",
    postal: "",
    country: "",
  });
  const [addressSaving, setAddressSaving] = useState(false);
  const [summaryDocEditing, setSummaryDocEditing] = useState(false);
  const [docDraft, setDocDraft] = useState<{
    document_type: "PARAGON" | "INVOICE";
    sales_document_number: string;
    company_name: string;
    nip: string;
    billing_email: string;
  }>({
    document_type: "PARAGON",
    sales_document_number: "",
    company_name: "",
    nip: "",
    billing_email: "",
  });
  const [docSaving, setDocSaving] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addBundleOpen, setAddBundleOpen] = useState(false);
  const [orderDocPreviewModal, setOrderDocPreviewModal] = useState<string | null>(null);
  const [docTypeModalFile, setDocTypeModalFile] = useState<File | null>(null);
  const [docTypeModalChoice, setDocTypeModalChoice] = useState<OrderDocModalType>(DEFAULT_DOC_MODAL_TYPE);
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [docUploadErr, setDocUploadErr] = useState<string | null>(null);
  const [extraOrderDocRows, setExtraOrderDocRows] = useState<OrderDocTableRow[]>([]);
  const [extraOrderFileRows, setExtraOrderFileRows] = useState<OrderDocTableRow[]>([]);
  const [extraOrderWaybillRows, setExtraOrderWaybillRows] = useState<OrderDocTableRow[]>([]);
  const [removedOrderDocIds, setRemovedOrderDocIds] = useState<string[]>([]);
  const [removedOrderFileIds, setRemovedOrderFileIds] = useState<string[]>([]);
  const [removedOrderWaybillIds, setRemovedOrderWaybillIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<DetailTabId>("summary");
  const [wmsFulfillment, setWmsFulfillment] = useState<WmsPackingOrderCardApi | null>(null);
  const [wmsLoading, setWmsLoading] = useState(false);
  const [wmsErr, setWmsErr] = useState<string | null>(null);
  const [replacementHistoryOpen, setReplacementHistoryOpen] = useState(false);
  const [showZeroQtyHistoryRows, setShowZeroQtyHistoryRows] = useState(false);
  const [tableReplaceOpen, setTableReplaceOpen] = useState(false);
  const [tableReplaceItemId, setTableReplaceItemId] = useState<number | null>(null);
  const [isStatusPanelCollapsed, setIsStatusPanelCollapsed] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const [officePin, setOfficePin] = useState(false);
  const [opDraft, setOpDraft] = useState("");
  const [opVisPick, setOpVisPick] = useState(true);
  const [opVisPack, setOpVisPack] = useState(true);
  const [opVisRet, setOpVisRet] = useState(false);
  const [opVisComp, setOpVisComp] = useState(false);
  const [opSaving, setOpSaving] = useState(false);
  const [editProductItem, setEditProductItem] = useState<OrderItemRow | null>(null);
  const [editProductModalFocus, setEditProductModalFocus] = useState<"main" | "rabat">("main");
  const [summaryLineRemoveItemId, setSummaryLineRemoveItemId] = useState<number | null>(null);
  const [summaryLineRemovePending, setSummaryLineRemovePending] = useState(false);
  const [orderRabatMode, setOrderRabatMode] = useState<"pct" | "pln">("pct");
  const [orderRabatDraft, setOrderRabatDraft] = useState("");
  const [orderRabatSaving, setOrderRabatSaving] = useState(false);

  const orderFulfillmentWhId = useMemo(() => {
    const raw = order?.warehouse_id;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }, [order?.warehouse_id]);

  const reloadOrderById = useCallback(async (oid: number) => {
    const res = await api.get<OrderDetail>(`/orders/${oid}/`);
    setOrder(res.data);
  }, []);

  const reloadOrderNotes = useCallback(async (oid: number) => {
    try {
      const rows = await getOrderNotes(oid);
      setOrderNotes(Array.isArray(rows) ? rows : []);
    } catch {
      setOrderNotes([]);
    }
  }, []);

  const loadPanelSummary = useCallback(async () => {
    if (orderFulfillmentWhId == null) {
      setPanelSummary(null);
      return;
    }
    try {
      const [s, sg] = await Promise.all([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID, orderFulfillmentWhId),
        getOrderPanelSubgroups(DAMAGE_TENANT_ID, orderFulfillmentWhId),
      ]);
      setPanelSummary(s);
      setPanelSubgroups(sg);
    } catch {
      setPanelSummary(null);
      setPanelSubgroups(null);
    }
  }, [orderFulfillmentWhId]);

  useEffect(() => {
    void loadPanelSummary();
  }, [loadPanelSummary]);

  useEffect(() => {
    if (!order || orderRabatSaving) return;
    setOrderRabatMode(order.discount_type === "amount" ? "pln" : "pct");
    setOrderRabatDraft(
      order.discount_value != null && Number.isFinite(Number(order.discount_value))
        ? String(Number(order.discount_value))
        : "",
    );
  }, [order, orderRabatSaving]);

  useEffect(() => {
    if (orderFulfillmentWhId == null) {
      setShippingMethods([]);
      return;
    }
    void getShippingMethods({
      tenant_id: DAMAGE_TENANT_ID,
      warehouse_id: orderFulfillmentWhId,
      active_only: false,
    })
      .then((list) =>
        setShippingMethods(list.map((x) => ({ id: x.id, name: x.name, is_active: x.is_active }))),
      )
      .catch(() => setShippingMethods([]));
  }, [orderFulfillmentWhId]);

  useEffect(() => {
    if (!order?.id) {
      setOfficePin(false);
      return;
    }
    try {
      setOfficePin(window.localStorage.getItem(orderOfficePinStorageKey(order.id)) === "1");
    } catch {
      setOfficePin(false);
    }
  }, [order?.id]);

  useEffect(() => {
    const st = location.state as { initialTab?: DetailTabId; scrollTo?: string } | null | undefined;
    if (!order?.id || !st?.initialTab) return;
    setActiveTab(st.initialTab);
    const sid = st.scrollTo;
    window.setTimeout(() => {
      if (sid) document.getElementById(sid)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [order?.id, location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!order) return;
    setShipDraft(order.shipping_method_id?.trim() ?? "");
    setPayMethodDraft((order.panel_payment_method ?? "").trim());
    setPayStatusDraft((order.panel_payment_status ?? "").trim());
    if (!addressEditing) {
      setAddrDraft(shippingFromOrderJson(order.addresses_json));
    }
  }, [order, addressEditing]);

  useEffect(() => {
    if (!id || !/^\d+$/.test(id)) {
      setErr("Nieprawidłowe ID");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    api
      .get<OrderDetail>(`/orders/${id}/`)
      .then((res) => {
        setOrder(res.data);
        void reloadOrderNotes(res.data.id);
      })
      .catch(() => setErr("Nie znaleziono zamówienia."))
      .finally(() => setLoading(false));
  }, [id, reloadOrderNotes]);

  useEffect(() => {
    if (!order?.id) {
      setOrderNotes([]);
      return;
    }
    void reloadOrderNotes(order.id);
  }, [order?.id, reloadOrderNotes]);

  const loadWmsFulfillment = useCallback(async () => {
    if (!order?.id) {
      setWmsFulfillment(null);
      setWmsErr(null);
      return;
    }
    setWmsLoading(true);
    setWmsErr(null);
    try {
      const w = await getOrderWmsFulfillment(order.id);
      setWmsFulfillment(w);
      setWmsErr(null);
    } catch {
      setWmsFulfillment(null);
      setWmsErr("Nie udało się wczytać danych magazynowych.");
    } finally {
      setWmsLoading(false);
    }
  }, [order?.id, order?.items?.length]);

  const saveOperationalNote = useCallback(async () => {
    if (!order?.id) return;
    const text = opDraft.trim();
    if (!text) return;
    setOpSaving(true);
    try {
      await postOrderOperationalNote(order.id, {
        content: text,
        show_in_picking: opVisPick,
        show_in_packing: opVisPack,
        show_in_returns: opVisRet,
        show_in_complaints: opVisComp,
      });
      setOpDraft("");
      await reloadOrderById(order.id);
      await loadWmsFulfillment();
    } catch {
      window.alert("Nie udało się zapisać notatki operacyjnej.");
    } finally {
      setOpSaving(false);
    }
  }, [
    order?.id,
    opDraft,
    opVisPick,
    opVisPack,
    opVisRet,
    opVisComp,
    reloadOrderById,
    loadWmsFulfillment,
  ]);

  useEffect(() => {
    if (!order) {
      setWmsFulfillment(null);
      setWmsErr(null);
      return;
    }
    void loadWmsFulfillment();
  }, [order, loadWmsFulfillment]);

  useEffect(() => {
    const onShortages = () => {
      if (!order?.id) return;
      void reloadOrderById(order.id);
      void loadWmsFulfillment();
    };
    window.addEventListener(WMS_SHORTAGES_UPDATED_EVENT, onShortages);
    return () => window.removeEventListener(WMS_SHORTAGES_UPDATED_EVENT, onShortages);
  }, [order?.id, reloadOrderById, loadWmsFulfillment]);

  const wmsByItemId = useMemo(() => {
    const m = new Map<number, WmsPackingOrderLineApi>();
    for (const ln of wmsFulfillment?.lines ?? []) {
      m.set(ln.order_item_id, ln);
    }
    return m;
  }, [wmsFulfillment]);

  const wmsMissingLineCountDetail = useMemo(() => {
    let n = 0;
    for (const ln of wmsFulfillment?.lines ?? []) {
      if (Number(ln.missing_quantity ?? 0) > 0) n += 1;
    }
    return n;
  }, [wmsFulfillment]);

  const wmsWorkflowPhaseForBadge = wmsFulfillment?.wms_workflow_phase ?? order?.wms_workflow_phase ?? null;
  const showWmsOperationalHeaderBadge = shouldShowOrderWmsOperationalBadge({
    workflowPhase: wmsWorkflowPhaseForBadge,
    packedAtIso: order?.wms_packed_at,
    missingLineCount: wmsMissingLineCountDetail,
  });

  const panelOrderStatusBrief = useMemo((): PanelConfigurableUiStatusBrief | null => {
    const s = order?.order_ui_status;
    if (!s) return null;
    const colorRaw = (s.badge_color || s.color || "#64748b").trim();
    return {
      name: s.name,
      color: colorRaw || "#64748b",
      main_group: s.main_group,
      badge_color: s.badge_color ?? null,
      background_color: s.background_color ?? null,
      text_color: s.text_color ?? null,
      image_url: s.image_url ?? null,
      is_active: s.is_active,
    };
  }, [order?.order_ui_status]);

  const logicalOrderGroups = useMemo(() => {
    if (!order) return [];
    return buildLogicalOrderItemGroups({
      items: order.items as LogicalOrderItemMember[],
      wmsByItemId,
      panelHistory: order.panel_fulfillment_history ?? [],
    });
  }, [order, wmsByItemId]);

  const summaryProductsLines = useMemo((): OrderSummaryProductsListLine[] => {
    if (!order) return [];
    const currency = order.currency;
    const basketCard = (wmsFulfillment?.basket_code ?? "").trim();
    const itemsById = new Map((order.items as LogicalOrderItemMember[]).map((it) => [it.id, it]));
    const out: OrderSummaryProductsListLine[] = [];
    for (const group of logicalOrderGroups) {
      if (!isLogicalOrderGroupVisible(group, showZeroQtyHistoryRows, wmsByItemId, itemsById)) continue;
      const it = order.items.find((x) => x.id === group.canonicalOrderItemId);
      if (!it || it.parent_bundle_order_item_id != null) continue;
      const wm = wmsByItemId.get(it.id);
      const catalog = (wm?.catalog_number ?? it.product?.symbol ?? "").trim();
      const location = (wm?.location_label ?? "").trim();
      const imageUrl = (wm?.image_url?.trim() || it.product?.image_url?.trim() || null) as string | null;
      const name =
        it.is_bundle_parent && (it.source_bundle?.name ?? "").trim()
          ? String(it.source_bundle!.name).trim()
          : (wm?.product_name?.trim() || it.product?.name?.trim() || "—") || "—";
      const sku = (it.product?.sku ?? wm?.sku ?? "").trim();
      const ean = (it.product?.ean ?? wm?.ean ?? "").trim();
      const qty = Number(it.quantity) || 0;
      const unitNetN = pickFirstFinite(it.unit_price_net, it.unit_price);
      const lineNetN = pickFirstFinite(it.line_net_total, it.total_price);
      const unitGrossN = pickFirstFinite(it.unit_price_gross);
      const lineGrossN = pickFirstFinite(it.line_gross_total);
      let marginPct = "—";
      let marginTone: "positive" | "negative" | "warn" | "neutral" = "neutral";
      const mp = it.line_margin_percent;
      const hasRev = lineNetN != null && lineNetN > 0;
      const purchaseKnown =
        it.line_purchase_total_net != null && Number.isFinite(Number(it.line_purchase_total_net));
      if (mp != null && Number.isFinite(Number(mp))) {
        marginPct = `${Number(mp).toFixed(1)}%`;
        marginTone = Number(mp) < 0 ? "negative" : "positive";
      } else if (hasRev && !purchaseKnown) {
        marginPct = "—";
        marginTone = "warn";
      }
      out.push({
        item: {
          id: it.id,
          quantity: it.quantity,
          product: it.product,
          vat_percent: it.vat_percent,
          total_price: it.total_price,
          unit_price: it.unit_price,
          unit_price_net: it.unit_price_net,
          unit_price_gross: it.unit_price_gross,
          line_net_total: it.line_net_total,
          line_gross_total: it.line_gross_total,
          line_margin_percent: it.line_margin_percent,
          oms_line_status: it.oms_line_status,
        },
        imageUrl,
        name,
        sku,
        ean,
        catalog,
        location,
        basket: basketCard,
        vatLabel: formatLineVatDisplay(it),
        quantityDisplay: fmtOmsQty(it.quantity),
        unitNet: unitNetN != null ? formatMoney(unitNetN, currency) : "—",
        unitGross: unitGrossN != null ? formatMoney(unitGrossN, currency) : "—",
        lineNet: lineNetN != null ? formatMoney(lineNetN, currency) : "—",
        lineGross: lineGrossN != null ? formatMoney(lineGrossN, currency) : "—",
        marginPct,
        marginTone,
        rabatDisplay: formatLineDiscountLabel(it),
        lineageRootId: group.lineageRootId,
        lineageMemberIds: group.memberOrderItemIds,
        eventTimeline: showZeroQtyHistoryRows ? group.timeline : undefined,
      });
    }
    return out;
  }, [order, logicalOrderGroups, wmsByItemId, wmsFulfillment?.basket_code, showZeroQtyHistoryRows]);

  const handleOrderLineMenuAction = useCallback(
    (action: OrderSummaryLineMenuAction, item: OrderSummaryProductItem) => {
      if (!order) return;
      const full = findOrderItemForMenuAction(order.items, item);
      const lockedMsg = orderLineMenuLockedMessage(full);
      if (lockedMsg) {
        window.alert(lockedMsg);
        return;
      }
      if (!full) {
        window.alert("Nie znaleziono pozycji zamówienia — odśwież widok i spróbuj ponownie.");
        return;
      }
      if (action === "edit") {
        setEditProductModalFocus("main");
        setEditProductItem(full);
      } else if (action === "rabat") {
        setEditProductModalFocus("rabat");
        setEditProductItem(full);
      } else {
        setSummaryLineRemoveItemId(Number(full.id));
      }
    },
    [order],
  );

  const replacementPairs = useMemo(
    () => (order ? buildOrderReplacementPairs(order.items, wmsByItemId) : []),
    [order, wmsByItemId],
  );

  const panelFulfillmentHistory = order?.panel_fulfillment_history ?? [];
  const historyChangeCount = countDistinctLogicalHistoryEvents(logicalOrderGroups);

  const tableReplaceContext = useMemo(() => {
    if (tableReplaceItemId == null || !order) return null;
    const item = order.items.find((it) => it.id === tableReplaceItemId);
    if (!item) return null;
    const wm = wmsByItemId.get(tableReplaceItemId);
    const sourceProductId = Number(wm?.product_id ?? item.product?.id ?? 0);
    if (!Number.isFinite(sourceProductId) || sourceProductId < 1) return null;
    const sourceProductName =
      (wm?.product_name ?? item.product?.name ?? "").trim() || `Produkt #${sourceProductId}`;
    let missingQuantity = Number(wm?.missing_quantity);
    if (!Number.isFinite(missingQuantity) || missingQuantity < 0) {
      const ordered = Number(item.quantity) || 0;
      const picked = Number(wm?.picked_quantity ?? 0) || 0;
      missingQuantity = Math.max(0, ordered - picked);
    }
    return { sourceProductId, sourceProductName, missingQuantity };
  }, [tableReplaceItemId, order, wmsByItemId]);

  const itemWaitingById = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const it of order?.items ?? []) {
      if (it.oms_waiting_for_stock) m.set(it.id, true);
    }
    return m;
  }, [order?.items]);

  const missingProductBadgeCount = useMemo(() => {
    const lines = wmsFulfillment?.lines ?? [];
    const withM = lines.filter((l) => (Number(l.missing_quantity ?? 0) || 0) > 1e-6);
    const keys = new Set<number>();
    for (const ln of withM) {
      const pid = ln.product_id ?? 0;
      keys.add(pid > 0 ? pid : -ln.order_item_id);
    }
    return keys.size;
  }, [wmsFulfillment]);

  const wmsDualWorkflow = useMemo(() => {
    const w = wmsFulfillment;
    if (!w || wmsLoading) return null;
    const total = Math.max(0, Number(w.total_quantity) || 0);
    let pickedSum = 0;
    for (const ln of w.lines ?? []) {
      const q = Math.max(0, Number(ln.quantity) || 0);
      const raw = Number(ln.picked_quantity) || 0;
      const pf =
        ln.picked_quantity_final != null && Number.isFinite(Number(ln.picked_quantity_final))
          ? Number(ln.picked_quantity_final)
          : raw;
      pickedSum += Math.min(q, pf);
    }
    const packed = Math.max(0, Number(w.packed_quantity) || 0);
    const vehicle = (w.wms_vehicle_label ?? "").trim() || (w.basket_code ?? "").trim() || "";
    return { total, pickedSum, packed, vehicle };
  }, [wmsFulfillment, wmsLoading]);

  const wmsSidebarTimeCells = useMemo(() => {
    const ot = wmsFulfillment?.operation_times ?? wmsFulfillment?.wms_operation_times;
    const pickSec = ot?.picking_time ?? ot?.picking_seconds;
    const packSec = ot?.packing_time ?? ot?.packing_seconds;
    let totSec: number | null | undefined = ot?.total_time ?? ot?.total_seconds;
    if (pickSec != null && packSec != null) {
      totSec = pickSec + packSec;
    }
    const pick =
      (ot?.picking_partial_label && String(ot.picking_partial_label).trim()) ||
      formatDurationFromSeconds(pickSec ?? undefined);
    const pack = formatDurationFromSeconds(packSec ?? undefined);
    const tot = formatDurationFromSeconds(totSec ?? undefined);
    const wfSec = ot?.warehouse_flow_seconds;
    const mag =
      wfSec != null && Number.isFinite(Number(wfSec)) && Number(wfSec) >= 0
        ? formatDurationFromSeconds(Number(wfSec))
        : pick !== "—"
          ? pick
          : pack !== "—"
            ? pack
            : "—";
    const loading = wmsLoading;
    const v = (s: string) => (loading ? "…" : s);

    const phase = String(wmsFulfillment?.wms_workflow_phase ?? "").toUpperCase();
    const tq = Number(wmsFulfillment?.total_quantity) || 0;
    const pq = Number(wmsFulfillment?.packed_quantity) || 0;
    const orderPacked =
      Boolean(wmsFulfillment?.is_completed) || phase === "PACKED" || (tq > 1e-9 && pq + 1e-6 >= tq);

    const chipDone = "Zakończono";
    const chipPending = loading ? "…" : "Trwa";
    const chipInactive = loading ? "…" : "—";
    const pickingActive = phase === "TO_PICK" || phase === "PICKING" || phase === "PARTIAL" || phase === "MISSING" || phase === "NEEDS_DECISION";
    const packingActive = phase === "PACKING";
    const chipTotal = orderPacked ? chipDone : chipPending;
    const chipPick = pickSec != null ? chipDone : pickingActive ? chipPending : chipInactive;
    const chipPack = packSec != null ? chipDone : packingActive ? chipPending : chipInactive;
    const chipMag = orderPacked ? chipDone : chipPending;

    return [
      { title: "Całkowity czas", value: v(tot), statusChip: chipTotal },
      { title: "Realizacja magazynu", value: v(mag), statusChip: chipMag },
      { title: "Czas pakowania", value: v(pack), statusChip: chipPack },
      { title: "Czas zbierania", value: v(pick), statusChip: chipPick },
    ] as const;
  }, [wmsFulfillment, wmsLoading]);

  const sidebarFilter = useMemo<OrderPanelFilter>(() => {
    const sid = order?.order_ui_status?.id;
    if (sid != null) return { kind: "sub", id: sid };
    return "unassigned";
  }, [order?.order_ui_status?.id]);

  const isStationarySale = useMemo(() => isStationarySaleOrder(order), [order]);
  const { requestPrint: requestOrderDocumentPrint, pickerModal: orderDocumentPickerModal, printBusy: orderDocumentPrintBusy } =
    useDocumentTemplatePrint({ tenantId: DAMAGE_TENANT_ID });

  const contact = useMemo(() => {
    if (!order) return { name: "—", phone: "—", email: "—", addressLines: ["—"] as string[] };
    const name = [order.first_name, order.last_name].filter(Boolean).join(" ").trim() || "—";
    const pe = parsePhoneEmail(order.addresses_json);
    const rawLines = parseShippingAddressBlock(order.addresses_json);
    const nameNorm = name !== "—" ? name.trim().toLowerCase() : "";
    let addressLines = rawLines;
    if (nameNorm && rawLines.length && rawLines[0].trim().toLowerCase() === nameNorm) {
      addressLines = rawLines.slice(1);
    }
    return {
      name,
      phone: pe.phone,
      email: pe.email,
      addressLines,
    };
  }, [order]);

  const billingInvoice = useMemo(
    () => (order ? parseBillingInvoice(order.addresses_json) : null),
    [order?.addresses_json],
  );

  const orderHasUnlinkedCustomerData = useMemo(() => {
    if (!order) return false;
    if (order.customer_id || order.customer?.id) return false;
    const email = contact.email !== "—" ? contact.email.trim() : "";
    const phone = contact.phone !== "—" ? contact.phone.trim() : "";
    const nip = (billingInvoice?.nip ?? "").replace(/\D/g, "");
    const company = (billingInvoice?.companyName ?? "").trim();
    const hasAddress = contact.addressLines.some((line) => line.trim() && line !== "—");
    return Boolean(email || phone || nip.length >= 10 || company || hasAddress);
  }, [order, contact, billingInvoice]);

  const shippingExtras = useMemo(
    () => (order ? parseShippingExtras(order.addresses_json) : null),
    [order?.addresses_json],
  );

  useEffect(() => {
    if (!order || summaryDocEditing) return;
    const inv = parseBillingInvoice(order.addresses_json);
    const t = (order.panel_document_type ?? "").trim().toUpperCase();
    setDocDraft({
      document_type: t === "INVOICE" ? "INVOICE" : "PARAGON",
      sales_document_number: (order.sales_document_number ?? "").trim(),
      company_name: inv.companyName,
      nip: inv.nip,
      billing_email: inv.email,
    });
  }, [order, summaryDocEditing]);

  const summaryShippingName = useMemo(
    () => (order ? (shippingFromOrderJson(order.addresses_json).name.trim() || contact.name) : "—"),
    [order, contact.name],
  );

  const summaryEstimatedDelivery = useMemo(() => {
    if (!order?.order_date) return "—";
    try {
      const d = new Date(order.order_date);
      if (Number.isNaN(d.getTime())) return "—";
      d.setDate(d.getDate() + 2);
      return formatDetailDate(d.toISOString());
    } catch {
      return "—";
    }
  }, [order?.order_date]);

  const dateLine = order ? formatDetailDate(order.order_date ?? order.created_at) : "—";

  const productsSubtotalGross = useMemo(() => {
    if (!order?.items?.length) return null;
    let sum = 0;
    let hasLine = false;
    for (const it of order.items) {
      if (it.parent_bundle_order_item_id != null) continue;
      const gross = it.line_gross_total;
      if (gross == null || !Number.isFinite(Number(gross))) return null;
      sum += Number(gross);
      hasLine = true;
    }
    return hasLine ? sum : null;
  }, [order]);

  const saveOrderDiscount = useCallback(async () => {
    if (!order) return;
    const parsed = parseDecimalDraft(orderRabatDraft);
    const value = parsed == null ? 0 : Math.max(0, parsed);
    setOrderRabatSaving(true);
    try {
      await patchOrder(order.id, {
        discount_type: value > 0 ? (orderRabatMode === "pct" ? "percent" : "amount") : null,
        discount_value: value > 0 ? value : null,
      });
      await reloadOrderById(order.id);
    } finally {
      setOrderRabatSaving(false);
    }
  }, [order, orderRabatDraft, orderRabatMode, reloadOrderById]);

  const orderDocumentApiRows = useMemo(() => {
    const empty = { docs: [] as OrderDocTableRow[], files: [] as OrderDocTableRow[], waybills: [] as OrderDocTableRow[] };
    if (!order?.order_documents?.length) return empty;
    const origin = getBackendPublicOrigin().replace(/\/$/, "");
    const resolveFileUrl = (fileUrl: string) => {
      const p = (fileUrl || "").trim();
      if (!p) return "";
      if (p.startsWith("http://") || p.startsWith("https://")) return p;
      if (!origin) return p;
      return `${origin}${p.startsWith("/") ? p : `/${p}`}`;
    };
    const docs: OrderDocTableRow[] = [];
    const files: OrderDocTableRow[] = [];
    const waybills: OrderDocTableRow[] = [];
    for (const d of order.order_documents) {
      const dt = (d.document_type || "").toUpperCase();
      const row: OrderDocTableRow = {
        id: `od-${d.id}`,
        name: d.original_filename,
        type: `api_${dt}`,
        status: "approved",
        date: formatDocsShortDate(d.created_at),
        fileUrl: resolveFileUrl(d.file_url),
        mimeType: guessMimeFromFilename(d.original_filename),
        typeLabel: orderDocumentTypeToLabel(dt),
      };
      if (dt === "ZALACZNIK") files.push(row);
      else if (dt === "LIST_PRZEWOZOWY") waybills.push(row);
      else if (ORDER_DOCS_SECTION_TYPES.has(dt)) docs.push(row);
      else docs.push(row);
    }
    return { docs, files, waybills };
  }, [order?.order_documents]);

  const docsTabDocumentsRowsSeed = useMemo((): OrderDocTableRow[] => {
    if (!order) return [];
    const baseDate = formatDocsShortDate(order.order_date ?? order.created_at);
    const linked = order.linked_documents ?? [];
    if (linked.length > 0) {
      return linked.map((doc) => {
        const isWz = doc.kind === "warehouse" || doc.document_type === "WZ";
        const isFa = doc.document_type === "FV" || doc.document_subtype === "INVOICE";
        const typeLabel: NonNullable<OrderDocTableRow["typeLabel"]> = isWz
          ? { abbr: "WZ", name: "WZ", tone: "wz" }
          : isFa
            ? { abbr: "Fa", name: "Faktura", tone: "fa" }
            : { abbr: "Pa", name: "Paragon", tone: "pa" };
        return {
          id: `linked-${doc.kind}-${doc.id}`,
          type: isWz ? "stock_document" : "sale_document",
          date: baseDate,
          typeLabel,
          name: doc.document_number || "—",
          status: "approved" as const,
          saleDocumentId: doc.sale_document_id ?? (doc.kind === "sale" ? doc.id : undefined),
          stockDocumentId: doc.stock_document_id ?? (doc.kind === "warehouse" ? Number(doc.id) : undefined),
          printKind: doc.print_kind ?? doc.document_subtype ?? doc.document_type,
        };
      });
    }
    const hasNum = Boolean((order.sales_document_number ?? "").trim());
    const docType = (order.panel_document_type ?? "").trim();
    let typeLabel: NonNullable<OrderDocTableRow["typeLabel"]>;
    if (docType === "INVOICE") typeLabel = { abbr: "Fa", name: "Faktura", tone: "fa" };
    else if (docType === "PARAGON") typeLabel = { abbr: "Pa", name: "Paragon", tone: "pa" };
    else typeLabel = { abbr: "RZ", name: "Rezerwacja", tone: "rz" };
    return [
      {
        id: "sale-doc",
        type: "sale_document",
        date: baseDate,
        typeLabel,
        name: (order.sales_document_number ?? "").trim() || "—",
        status: hasNum ? "approved" : "pending",
      },
    ];
  }, [order]);

  const docsTabDocumentsRows = useMemo(() => {
    const hide = new Set(removedOrderDocIds);
    return [...docsTabDocumentsRowsSeed, ...orderDocumentApiRows.docs, ...extraOrderDocRows].filter(
      (r) => !hide.has(r.id),
    );
  }, [docsTabDocumentsRowsSeed, orderDocumentApiRows.docs, extraOrderDocRows, removedOrderDocIds]);

  const docsTabFilesRowsSeed = useMemo((): OrderDocTableRow[] => {
    if (!order) return [];
    return [
      {
        id: "no-files",
        type: "placeholder",
        date: "—",
        name: "Brak załączonych plików",
        status: "pending",
      },
    ];
  }, [order]);

  const docsTabFilesRows = useMemo(() => {
    const hide = new Set(removedOrderFileIds);
    const extras = extraOrderFileRows.filter((r) => !hide.has(r.id));
    const apiRows = orderDocumentApiRows.files.filter((r) => !hide.has(r.id));
    const merged = [...apiRows, ...extras];
    if (merged.length > 0) return merged;
    return docsTabFilesRowsSeed.filter((r) => !hide.has(r.id));
  }, [docsTabFilesRowsSeed, orderDocumentApiRows.files, extraOrderFileRows, removedOrderFileIds]);

  const docsTabWaybillsRowsSeed = useMemo((): OrderDocTableRow[] => {
    if (!order) return [];
    const baseDate = formatDocsShortDate(order.order_date ?? order.created_at);
    const raw = (order.panel_tracking_numbers ?? "").trim();
    const parts = raw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return [
        {
          id: "no-tr",
          type: "waybill",
          date: baseDate,
          name: "Brak numeru z importu. Wygenerowane etykiety pojawią się po integracji przewoźnika.",
          status: "pending",
        },
      ];
    }
    const demoPdf =
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
    return parts.map((p, i) => ({
      id: `tr-${i}`,
      type: "waybill",
      date: baseDate,
      name: p,
      status: "approved" as const,
      fileUrl: i === 0 ? demoPdf : undefined,
    }));
  }, [order]);

  const docsTabWaybillsRows = useMemo(() => {
    const hide = new Set(removedOrderWaybillIds);
    return [...docsTabWaybillsRowsSeed, ...orderDocumentApiRows.waybills, ...extraOrderWaybillRows].filter(
      (r) => !hide.has(r.id),
    );
  }, [docsTabWaybillsRowsSeed, orderDocumentApiRows.waybills, extraOrderWaybillRows, removedOrderWaybillIds]);

  const handleOrderDocUpload = useCallback(
    (section: "docs" | "files" | "waybills", fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file || !order) return;
      if (section === "docs") {
        setDocUploadErr(null);
        setDocTypeModalChoice(DEFAULT_DOC_MODAL_TYPE);
        setDocTypeModalFile(file);
        return;
      }
      const docType: OrderPanelUploadDocumentType = section === "files" ? "ZALACZNIK" : "LIST_PRZEWOZOWY";
      void (async () => {
        setDocUploadBusy(true);
        setDocUploadErr(null);
        try {
          const data = await uploadOrderDocument(order.id, file, docType);
          setOrder(data as OrderDetail);
        } catch (e) {
          setDocUploadErr(formatApiError(e));
        } finally {
          setDocUploadBusy(false);
        }
      })();
    },
    [order],
  );

  const handleConfirmDocTypeModal = useCallback(() => {
    if (!order || !docTypeModalFile) return;
    void (async () => {
      setDocUploadBusy(true);
      setDocUploadErr(null);
      try {
        const data = await uploadOrderDocument(order.id, docTypeModalFile, docTypeModalChoice);
        setOrder(data as OrderDetail);
        setDocTypeModalFile(null);
      } catch (e) {
        setDocUploadErr(formatApiError(e));
      } finally {
        setDocUploadBusy(false);
      }
    })();
  }, [order, docTypeModalFile, docTypeModalChoice]);

  const handleOrderDocPreview = useCallback((row: OrderDocTableRow) => {
    if (row.fileUrl && orderDocRowIsPdfOrImage(row)) {
      window.open(row.fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setOrderDocPreviewModal(row.name);
  }, []);

  const handleOrderDocDownload = useCallback((row: OrderDocTableRow) => {
    if (row.fileUrl) {
      window.open(row.fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    console.log("[download] brak URL pliku (symulacja)", row.id, row.name);
  }, []);

  const handleOrderDocPrint = useCallback(
    (row: OrderDocTableRow) => {
      if (!order) return;
      if (row.saleDocumentId) {
        void requestOrderDocumentPrint({
          kind: "sale_document",
          documentId: row.saleDocumentId,
          kindCode: saleKindFromSubtype(String(row.printKind ?? order.panel_document_type ?? "INVOICE")),
        });
        return;
      }
      if (row.stockDocumentId != null) {
        void requestOrderDocumentPrint({
          kind: "stock_document",
          documentId: row.stockDocumentId,
          kindCode: stockKindFromType(String(row.printKind ?? "WZ")),
        });
        return;
      }
      if (row.fileUrl) {
        window.open(row.fileUrl, "_blank", "noopener,noreferrer");
      }
    },
    [order, requestOrderDocumentPrint],
  );

  const handleOrderDocDelete = useCallback(
    (section: "docs" | "files" | "waybills", row: OrderDocTableRow) => {
      if (!order) return;
      if (!window.confirm(`Usunąć wpis „${row.name}”?`)) return;
      const m = /^od-(\d+)$/.exec(row.id);
      if (m) {
        void (async () => {
          setDocUploadBusy(true);
          setDocUploadErr(null);
          try {
            const data = await deleteOrderDocument(order.id, Number(m[1]));
            setOrder(data as OrderDetail);
          } catch (e) {
            setDocUploadErr(formatApiError(e));
          } finally {
            setDocUploadBusy(false);
          }
        })();
        return;
      }
      if (row.fileUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(row.fileUrl);
        } catch {
          /* ignore */
        }
      }
      const rid = row.id;
      if (rid.startsWith("up-")) {
        if (section === "docs") setExtraOrderDocRows((list) => list.filter((x) => x.id !== rid));
        else if (section === "files") setExtraOrderFileRows((list) => list.filter((x) => x.id !== rid));
        else setExtraOrderWaybillRows((list) => list.filter((x) => x.id !== rid));
        return;
      }
      if (section === "docs") setRemovedOrderDocIds((p) => (p.includes(rid) ? p : [...p, rid]));
      else if (section === "files") setRemovedOrderFileIds((p) => (p.includes(rid) ? p : [...p, rid]));
      else setRemovedOrderWaybillIds((p) => (p.includes(rid) ? p : [...p, rid]));
    },
    [order],
  );

  const handleOrderDocEmail = useCallback((row: OrderDocTableRow) => {
    console.log("[email] (placeholder)", row.id, row.name);
  }, []);

  const orderHistoryTimelineEvents = useMemo(
    () => (order ? buildOrderHistoryTimelineEvents(order, wmsFulfillment) : []),
    [order, wmsFulfillment],
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-slate-500 bg-white p-6">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
        Ładowanie…
      </div>
    );
  }
  if (err || !order) {
    return (
      <div className="bg-white p-6 h-screen">
        <p className="text-sm text-red-600">{err || "Błąd"}</p>
        <Link to="/orders/list" className="mt-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline">
          ← Lista zamówień
        </Link>
      </div>
    );
  }

  const orderNavIds = (location.state as { orderNavIds?: number[] } | null)?.orderNavIds;
  const navIndex = orderNavIds ? orderNavIds.indexOf(order.id) : -1;
  const prevOrderId = navIndex > 0 ? orderNavIds![navIndex - 1] : null;
  const nextOrderId =
    orderNavIds != null && navIndex >= 0 && navIndex < orderNavIds.length - 1 ? orderNavIds[navIndex + 1] : null;

  const shippingLabel = (order.shipping_method ?? "").trim() || "—";
  const linesTotalDisplay =
    productsSubtotalGross != null
      ? formatMoney(productsSubtotalGross, order.currency)
      : order.value != null && Number.isFinite(Number(order.value))
        ? formatMoney(Number(order.value), order.currency)
        : "—";
  const productsAfterDiscount =
    order.total_products_value != null && Number.isFinite(Number(order.total_products_value))
      ? Number(order.total_products_value)
      : null;
  const discountAmount = order.discount_amount != null && Number.isFinite(Number(order.discount_amount)) ? Number(order.discount_amount) : 0;
  const marginTone =
    order.margin == null || !Number.isFinite(Number(order.margin))
      ? productsAfterDiscount != null &&
          productsAfterDiscount > 0 &&
          (order.total_purchase_cost == null || !Number.isFinite(Number(order.total_purchase_cost)))
        ? "text-amber-700"
        : "text-slate-900"
      : Number(order.margin) < 0
        ? "text-red-700"
        : Number(order.margin) < 10
          ? "text-amber-700"
          : "text-emerald-700";

  const wmTimelineEvents = wmsFulfillment?.timeline ?? wmsFulfillment?.wms_timeline ?? [];
  const timelinePickEvt = wmTimelineEvents.find((e) =>
    /pick|zbier|PICK/i.test(`${e.event_type ?? ""} ${e.title ?? ""}`),
  );
  const timelinePackEvt = wmTimelineEvents.find((e) =>
    /pack|pakow|PACK/i.test(`${e.event_type ?? ""} ${e.title ?? ""}`),
  );

  const panelDocumentLabel =
    (order.panel_document_type ?? "").trim().toUpperCase() === "INVOICE"
      ? "Faktura"
      : (order.panel_document_type ?? "").trim().toUpperCase() === "PARAGON"
        ? "Paragon"
        : (order.panel_document_type ?? "").trim() || "—";

  return (
    <div className="min-h-screen flex font-sans text-slate-800 bg-white">
      {/* Pasek statusów wg Twojej logiki */}
      <div className={`hidden min-h-0 min-w-0 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex ${isStatusPanelCollapsed ? "w-14" : "w-[260px]"}`}>
         <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
           <OrderStatusSidebar
              warehouseId={orderFulfillmentWhId}
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              panelFilter={sidebarFilter}
              onPanelFilterChange={(f) => navigate("/orders/list", { state: { panelFilter: f } })}
              chromeVariant="sellasist"
              collapsed={isStatusPanelCollapsed}
              parentScrollContainer
              onToggleCollapsed={() => setIsStatusPanelCollapsed((v) => !v)}
            />
         </div>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-white">
        <OrderDetailHeaderBar
          order={order}
          setOrder={setOrder}
          locationState={location.state}
          navigate={navigate}
          prevOrderId={prevOrderId}
          nextOrderId={nextOrderId}
          dateLine={dateLine}
          officePin={officePin}
          setOfficePin={setOfficePin}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setCaseCreateKind(null);
            setActiveTab(tab);
          }}
          requestOrderDocumentPrint={requestOrderDocumentPrint}
          orderDocumentPrintBusy={orderDocumentPrintBusy}
          isStationarySale={isStationarySale}
          orderFulfillmentWhId={orderFulfillmentWhId}
          panelSummary={panelSummary}
          panelSubgroups={panelSubgroups}
          panelSaving={panelSaving}
          setPanelSaving={setPanelSaving}
          loadPanelSummary={loadPanelSummary}
          panelOrderStatusBrief={panelOrderStatusBrief}
          wmsDualWorkflow={wmsDualWorkflow}
          shippingLabel={shippingLabel}
          onOpenCaseCreate={(kind) => setCaseCreateKind(kind)}
        />

        <div className={`flex-1 overflow-auto bg-white py-3 ${odMainHorizontalPadClass}`}>
          <div className="w-full">
            {caseCreateKind ? (
              <OrderCaseCreateView
                kind={caseCreateKind}
                order={order}
                warehouseId={orderFulfillmentWhId}
                onCancel={() => setCaseCreateKind(null)}
                onCreated={(kind, createdId) => {
                  setCaseCreateKind(null);
                  if (kind === "return") navigate(`/orders/returns/${createdId}`);
                  else navigate(`/orders/complaints/${createdId}`);
                }}
              />
            ) : null}
            {!caseCreateKind && activeTab === "summary" ? (
              <OrderDetailSummaryTab
                order={order}
                contact={contact}
                setEditBuyerModalOpen={setEditBuyerModalOpen}
                orderHasUnlinkedCustomerData={orderHasUnlinkedCustomerData}
                reloadOrderById={reloadOrderById}
                loadWmsFulfillment={loadWmsFulfillment}
                payMethodDraft={payMethodDraft}
                setPayMethodDraft={setPayMethodDraft}
                payStatusDraft={payStatusDraft}
                setPayStatusDraft={setPayStatusDraft}
                isStationarySale={isStationarySale}
                shipDraft={shipDraft}
                setShipDraft={setShipDraft}
                orderFulfillmentWhId={orderFulfillmentWhId}
                shippingMethods={shippingMethods}
                shipPaySaving={shipPaySaving}
                setShipPaySaving={setShipPaySaving}
                addressEditing={addressEditing}
                setAddressEditing={setAddressEditing}
                addrDraft={addrDraft}
                setAddrDraft={setAddrDraft}
                addressSaving={addressSaving}
                setAddressSaving={setAddressSaving}
                summaryShippingName={summaryShippingName}
                shippingExtras={shippingExtras}
                summaryDocEditing={summaryDocEditing}
                setSummaryDocEditing={setSummaryDocEditing}
                docDraft={docDraft}
                setDocDraft={setDocDraft}
                panelDocumentLabel={panelDocumentLabel}
                docSaving={docSaving}
                setDocSaving={setDocSaving}
                billingInvoice={billingInvoice}
                requestOrderDocumentPrint={requestOrderDocumentPrint}
                summaryProductsLines={summaryProductsLines}
                handleOrderLineMenuAction={handleOrderLineMenuAction}
                wmsLoading={wmsLoading}
                wmsFulfillment={wmsFulfillment}
                docsTabWaybillsRows={docsTabWaybillsRows}
                setActiveTab={setActiveTab}
                onAddProduct={() => setAddProductOpen(true)}
                onAddBundle={() => setAddBundleOpen(true)}
                formatDetailDate={formatDetailDate}
                opDraft={opDraft}
                setOpDraft={setOpDraft}
                opVisPick={opVisPick}
                setOpVisPick={setOpVisPick}
                opVisPack={opVisPack}
                setOpVisPack={setOpVisPack}
                opSaving={opSaving}
                saveOperationalNote={saveOperationalNote}
                noteDraft={noteDraft}
                setNoteDraft={setNoteDraft}
                linesTotalDisplay={linesTotalDisplay}
                orderRabatMode={orderRabatMode}
                setOrderRabatMode={setOrderRabatMode}
                orderRabatDraft={orderRabatDraft}
                setOrderRabatDraft={setOrderRabatDraft}
                orderRabatSaving={orderRabatSaving}
                saveOrderDiscount={saveOrderDiscount}
                productsAfterDiscount={productsAfterDiscount}
                marginTone={marginTone}
                timelinePickEvt={timelinePickEvt}
                timelinePackEvt={timelinePackEvt}
              />
            ) : null}

            {!caseCreateKind && activeTab === "products" ? (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
                <div className="min-w-0 space-y-4">
                    {wmsErr && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900 shadow-sm">{wmsErr}</p>}

                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Zamówione produkty</h2>
                        <label className="flex items-center text-xs font-medium text-slate-600">
                          <input type="checkbox" className="mr-1.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={showZeroQtyHistoryRows} onChange={(e) => setShowZeroQtyHistoryRows(e.target.checked)} />
                          Pokaż usunięte
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link to={WMS_ROUTES.packingOrder(order.id)} className={brandPrimaryButtonClass}>Spakuj</Link>
                        <button type="button" onClick={() => setAddProductOpen(true)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold shadow-sm transition-colors hover:bg-slate-50">Dodaj produkt</button>
                        <button type="button" onClick={() => setAddBundleOpen(true)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold shadow-sm transition-colors hover:bg-slate-50">Dodaj zestaw</button>
                      </div>
                    </div>

                    <ImportedWarehouseSection lines={summaryProductsLines} orderItems={order.items} wmsByItemId={wmsByItemId} wmsFulfillment={wmsFulfillment} wmsLoading={wmsLoading} currency={order.currency} productEditTenantId={order.tenant_id ?? DAMAGE_TENANT_ID} orderId={order.id} linesTotalDisplay={linesTotalDisplay} itemWaitingById={itemWaitingById} onRefreshOrder={() => void reloadOrderById(order.id)} onRefreshWms={() => void loadWmsFulfillment()} onReplaceProduct={(oid) => { setTableReplaceItemId(oid); setTableReplaceOpen(true); }} onLineAction={handleOrderLineMenuAction} formatMoney={formatMoney} panelFulfillmentHistory={panelFulfillmentHistory} formatDetailDate={formatDetailDate} showProductLineHistory={showZeroQtyHistoryRows} />

                    <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Razem (produkty)</span>
                      <span className="text-xl font-black tabular-nums text-slate-900">{linesTotalDisplay}</span>
                    </div>

                    <section className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
                      <div className="mb-2.5 flex items-center justify-between gap-2">
                        <h3 className="text-[13px] font-bold tracking-tight text-slate-900">
                          Dopasowane opakowanie
                          {(() => {
                            const n =
                              (wmsFulfillment?.packaging_suggestions?.length ?? 0) ||
                              (wmsFulfillment?.primary_packaging_suggestion ? 1 : 0) +
                                (wmsFulfillment?.packaging_alternatives?.length ?? 0);
                            return n > 0 ? (
                              <span className="font-semibold text-slate-500">
                                {" "}
                                • {n} {n === 1 ? "opakowanie" : "opakowania"}
                              </span>
                            ) : null;
                          })()}
                        </h3>
                        <Link to={WMS_ROUTES.packingOrder(order.id)} className="text-slate-400 transition-colors hover:text-slate-800" aria-label="Edytuj opakowanie">
                          <Pencil className="h-4 w-4" strokeWidth={2} />
                        </Link>
                      </div>
                      <OrderMatchedPackagingSection card={wmsFulfillment} productsGallery />
                    </section>
                </div>
                <aside className="w-full space-y-3 lg:sticky lg:top-3 lg:w-[320px] lg:shrink-0 lg:justify-self-end xl:w-[340px]">
                  <WmsOperationTimesKpiPanel cells={wmsSidebarTimeCells} />
                  {orderFulfillmentWhId != null ? (
                    <WmsOrderValidationPanel
                      tenantId={order.tenant_id ?? DAMAGE_TENANT_ID}
                      warehouseId={orderFulfillmentWhId}
                      orderId={order.id}
                    />
                  ) : null}
                  <OrderHistoryTimeline compact hideHeader events={orderHistoryTimelineEvents} formatDate={formatDetailDate} title="Historia zamówienia" />
                </aside>
              </div>
            ) : null}

            {!caseCreateKind && activeTab === "comms" ? (
              <OrderDetailCommsTab
                order={order}
                contact={contact}
                orderNotes={orderNotes}
                noteDraft={noteDraft}
                setNoteDraft={setNoteDraft}
                opDraft={opDraft}
                setOpDraft={setOpDraft}
                opVisPick={opVisPick}
                setOpVisPick={setOpVisPick}
                opVisPack={opVisPack}
                setOpVisPack={setOpVisPack}
                opSaving={opSaving}
                saveOperationalNote={saveOperationalNote}
                formatDetailDate={formatDetailDate}
                formatMoney={formatMoney}
                customerComment={(wmsFulfillment?.customer_comment ?? order.latest_customer_comment_preview ?? "").trim()}
                onReloadOrder={() => void reloadOrderById(order.id)}
                onReloadNotes={() => void reloadOrderNotes(order.id)}
                tenantId={order.tenant_id ?? DAMAGE_TENANT_ID}
              />
            ) : null}

            {!caseCreateKind && activeTab === "docs" ? (
              <div className="mt-1 w-full max-w-none space-y-3.5">
                <OrderDocFilesTableSection
                  title={`Dokumenty (${docsTabDocumentsRows.length})`}
                  rows={docsTabDocumentsRows}
                  showTypeColumn
                  variant="documents"
                  onUploadFiles={(files) => handleOrderDocUpload("docs", files)}
                  onPreview={handleOrderDocPreview}
                  onPrint={handleOrderDocPrint}
                  onDownload={handleOrderDocDownload}
                  onEmail={handleOrderDocEmail}
                  onDelete={(row) => handleOrderDocDelete("docs", row)}
                />
                <OrderDocFilesTableSection
                  title={`Załączniki (${docsTabFilesRows.length})`}
                  rows={docsTabFilesRows}
                  showTypeColumn={false}
                  variant="attachments"
                  onUploadFiles={(files) => handleOrderDocUpload("files", files)}
                  onPreview={handleOrderDocPreview}
                  onPrint={handleOrderDocPrint}
                  onDownload={handleOrderDocDownload}
                  onEmail={handleOrderDocEmail}
                  onDelete={(row) => handleOrderDocDelete("files", row)}
                />
                <OrderDocFilesTableSection
                  title={`Listy przewozowe (${docsTabWaybillsRows.length})`}
                  rows={docsTabWaybillsRows}
                  showTypeColumn
                  variant="waybills"
                  onUploadFiles={(files) => handleOrderDocUpload("waybills", files)}
                  onPreview={handleOrderDocPreview}
                  onPrint={handleOrderDocPrint}
                  onDownload={handleOrderDocDownload}
                  onEmail={handleOrderDocEmail}
                  onDelete={(row) => handleOrderDocDelete("waybills", row)}
                />
              </div>
            ) : null}

            {!caseCreateKind && activeTab === "logs" ? (
              <div className="mt-1 w-full max-w-none">
                <ActivityLogPanel
                  objectType="order"
                  objectId={order.id}
                  defaultCollapsed={false}
                  className="mt-0"
                />
              </div>
            ) : (
              <div className={`${odMainMaxWidthClass} mt-8 border-t border-slate-100 pt-4 pb-6`}>
                <ActivityLogPanel objectType="order" objectId={order.id} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODALS */}
      {orderDocPreviewModal != null && (
        <AppOverlayPortal>
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setOrderDocPreviewModal(null)}>
          <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold text-slate-900 mb-2">Podgląd</p>
            <p className="text-sm text-slate-600 mb-6 break-all">{orderDocPreviewModal}</p>
            <div className="flex justify-end"><button className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors" onClick={() => setOrderDocPreviewModal(null)}>Zamknij</button></div>
          </div>
        </div>
        </AppOverlayPortal>
      )}

      {docTypeModalFile && (
        <AppOverlayPortal>
        <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => !docUploadBusy && setDocTypeModalFile(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold text-slate-900 mb-1">Typ dokumentu</p>
            <p className="text-sm text-slate-500 mb-6 truncate">{docTypeModalFile.name}</p>
            <label className="block text-sm font-bold text-slate-700 mb-2">Wybierz rodzaj wgrywanego pliku:</label>
            <select className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 mb-6" value={docTypeModalChoice} disabled={docUploadBusy} onChange={(e) => setDocTypeModalChoice(e.target.value as OrderDocModalType)}>
              {ORDER_DOCUMENT_MODAL_TYPES.map((t) => <option key={t} value={t}>{orderDocumentTypeToLabel(t).name}</option>)}
            </select>
            <div className="flex justify-end gap-3">
              <button className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors" disabled={docUploadBusy} onClick={() => setDocTypeModalFile(null)}>Anuluj</button>
              <button className={brandPrimaryButtonClass} disabled={docUploadBusy} onClick={handleConfirmDocTypeModal}>{docUploadBusy ? "Wgrywanie…" : "Wgraj plik"}</button>
            </div>
          </div>
        </div>
        </AppOverlayPortal>
      )}

      <OrderAddProductModal open={addProductOpen} onClose={() => setAddProductOpen(false)} tenantId={DAMAGE_TENANT_ID} orderId={order.id} currency={(order.currency ?? "PLN").trim() || "PLN"} onAdded={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); dispatchWmsShortagesUpdated(); }}/>
      <OrderAddBundleModal open={addBundleOpen} onClose={() => setAddBundleOpen(false)} tenantId={order.tenant_id ?? DAMAGE_TENANT_ID} orderId={order.id} currency={(order.currency ?? "PLN").trim() || "PLN"} onAdded={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); dispatchWmsShortagesUpdated(); }}/>
      
      {tableReplaceOpen && tableReplaceItemId != null && tableReplaceContext && (
        <OrderReplaceProductModal open onClose={() => { setTableReplaceOpen(false); setTableReplaceItemId(null); }} orderId={order.id} tenantId={DAMAGE_TENANT_ID} orderItemId={tableReplaceItemId} sourceProductId={tableReplaceContext.sourceProductId} sourceProductName={tableReplaceContext.sourceProductName} missingQuantity={tableReplaceContext.missingQuantity} warehouseId={orderFulfillmentWhId} onReplaced={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); dispatchWmsShortagesUpdated(); setTableReplaceOpen(false); setTableReplaceItemId(null); }} />
      )}

      <OrderEditProductModal open={editProductItem != null} onClose={() => { setEditProductItem(null); setEditProductModalFocus("main"); }} orderId={order.id} item={editProductItem} focusSection={editProductModalFocus} currency={(order.currency ?? "PLN").trim() || "PLN"} onSaved={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); }} />

      {summaryLineRemoveItemId != null && (
        <ConfirmModal title="Usunąć pozycję?" message={<>Czy na pewno usunąć pozycję z zamówienia?</>} confirmLabel="Usuń" pending={summaryLineRemovePending} onCancel={() => { if (!summaryLineRemovePending) setSummaryLineRemoveItemId(null); }} onConfirm={async () => { const id = summaryLineRemoveItemId; if (id == null) return; setSummaryLineRemovePending(true); try { await deleteOrderItemLine(order.id, id); await reloadOrderById(order.id); await loadWmsFulfillment(); dispatchWmsShortagesUpdated(); setSummaryLineRemoveItemId(null); } catch (e: unknown) { console.error("[order.item.delete]", e); toast.error(extractApiErrorMessage(e, "Nie udało się usunąć produktu z zamówienia.")); } finally { setSummaryLineRemovePending(false); } }} />
      )}

      {orderFulfillmentWhId != null && (
        <NewComplaintWizard open={complaintWizardOpen} onClose={() => { setComplaintWizardOpen(false); setComplaintPrefillItemIds(undefined); }} warehouseId={orderFulfillmentWhId} initialOrderId={order?.id ?? null} initialOrderItemIds={complaintPrefillItemIds} onCreated={(cid) => navigate(`/orders/complaints/${cid}`)} />
      )}

      {order && (
        <EditBuyerModal open={editBuyerModalOpen} onClose={() => setEditBuyerModalOpen(false)} orderId={order.id} initialFirstName={(order.first_name ?? "").trim()} initialLastName={(order.last_name ?? "").trim()} initialPhone={contact.phone === "—" ? "" : contact.phone} initialEmail={contact.email === "—" ? "" : contact.email} canSave={order != null} onSaved={() => void reloadOrderById(order.id)} />
      )}
      {orderDocumentPickerModal}
    </div>
  );
}
