import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
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
  Mail,
  MessageSquare,
  MessageSquareWarning,
  Pin,
  Phone,
  Search,
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
  Plus
} from "lucide-react";
import api from "../../api/axios";
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
import { formatMoney } from "../../utils/formatOrderMoney";
import OrderAdditionalFieldsSection from "../../components/orders/OrderAdditionalFieldsSection";
import OrderMissingProductsSection from "../../components/orders/OrderMissingProductsSection";
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
import { buildOrderHistoryTimelineEvents } from "../../components/orders/orderHistoryTimelineModel";
import { getShippingMethods } from "../../api/shippingMethodsApi";
import { getOrderPanelSubgroups, getOrderUiStatusSummary, patchOrderUiStatus } from "../../api/orderUiStatusApi";
import { useWarehouse } from "../../context/WarehouseContext";
import type { OrderUiPanelSubgroupRead, OrderUiStatusBrief, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { ShippingMethodLogo } from "../../components/shipping/ShippingMethodLogo";
import NewComplaintWizard from "../Complaints/NewComplaintWizard";
import { OrderStatusSidebar, ORDERS_PANEL_GROUP_LABELS, type OrderPanelFilter } from "../../components/orders/OrderStatusSidebar";
import { OrderUiStatusConfigRowPresent } from "../../components/orders/orderList/OrderUiStatusConfigRowPresent";
import { OrderWmsOperationalBadge } from "../../components/orders/orderList/OrderWmsOperationalBadge";
import { shouldShowOrderWmsOperationalBadge } from "../../utils/orderWmsOperationalBadgeVisibility";
import { OrderMatchedPackagingSection } from "../../components/orders/OrderMatchedPackagingSection";
import { OrderDetailPrimaryStatusDropdown } from "../../components/orders/OrderDetailPrimaryStatusDropdown";
import {
  OrderSummaryProductsList,
  type OrderSummaryLineMenuAction,
  type OrderSummaryProductItem,
  type OrderSummaryProductsListLine,
} from "../../components/orders/OrderSummaryProductsList";
import { OrderWarehouseProductsSection } from "../../components/orders/OrderWarehouseProductsSection";
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
import { dispatchWmsShortagesUpdated, WMS_ROUTES, WMS_SHORTAGES_UPDATED_EVENT } from "../wms/wmsRoutes";

type SourceBundleBrief = { id: number; name: string; sku?: string | null };

type OrderItemRow = {
  id: number;
  quantity: number;
  unit_price?: number | null;
  unit_price_net?: number | null;
  unit_price_gross?: number | null;
  vat_percent?: number | null;
  unit?: string | null;
  list_price?: number | null;
  total_price?: number | null;
  line_net_total?: number | null;
  line_vat_amount?: number | null;
  line_gross_total?: number | null;
  line_purchase_total_net?: number | null;
  line_margin_amount?: number | null;
  line_margin_percent?: number | null;
  oms_replacement_original_quantity?: number | null;
  oms_replacement_transferred_quantity?: number | null;
  oms_waiting_for_stock?: boolean;
  oms_line_status?: string | null;
  replaced_from_order_item_id?: number | null;
  replaced_from_product_name?: string | null;
  product?: {
    id?: number;
    name?: string | null;
    ean?: string | null;
    symbol?: string | null;
    sku?: string | null;
    image_url?: string | null;
  };
  source_bundle_id?: number | null;
  bundle_instance_id?: string | null;
  bundle_qty?: number | null;
  from_bundle?: boolean;
  source_bundle?: SourceBundleBrief | null;
  is_bundle_parent?: boolean;
  parent_bundle_order_item_id?: number | null;
  bundle_display_unit_price?: number | null;
  bundle_display_line_total?: number | null;
};

type OrderDetail = {
  id: number;
  tenant_id?: number;
  number?: string | null;
  status?: string | null;
  scan_code?: string | null;
  value?: number | null;
  discount_type?: "percent" | "amount" | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  total_products_value?: number | null;
  shipping_revenue_net?: number | null;
  total_revenue_net?: number | null;
  total_purchase_cost?: number | null;
  gross_profit?: number | null;
  margin?: number | null;
  currency?: string | null;
  shipping_method_id?: string | null;
  shipping_method?: string | null;
  shipping_method_logo_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  external_id?: string | null;
  source?: string | null;
  order_origin?: string | null;
  complaint_id?: number | null;
  original_order_id?: number | null;
  complaint_order_type?: string | null;
  items: OrderItemRow[];
  order_ui_status?: (OrderUiStatusBrief & {
    badge_color?: string;
    background_color?: string;
    text_color?: string;
    image_url?: string | null;
  }) | null;
  priority_color?: string | null;
  order_date?: string | null;
  created_at?: string | null;
  addresses_json?: string | null;
  sales_document_number?: string | null;
  panel_document_type?: string | null;
  panel_document_series_id?: string | null;
  panel_payment_method?: string | null;
  panel_payment_status?: string | null;
  wms_packed_at?: string | null;
  wms_packed_by_label?: string | null;
  wms_workflow_phase?: string | null;
  panel_amount_paid?: string | null;
  panel_shipping_cost?: number | null;
  panel_shipping_cost_display?: string | null;
  panel_tracking_numbers?: string | null;
  selected_carton_id?: string | null;
  selected_carton?: {
    id: string;
    name: string;
    dimensions?: string | null;
    image_url?: string | null;
  } | null;
  customer_id?: number | null;
  customer?: { id: number; display_name: string } | null;
  panel_fulfillment_history?: {
    at: string;
    lines: string[];
    kind?: string | null;
    product_name?: string | null;
    product_sku?: string | null;
    product_ean?: string | null;
    quantity_ordered?: number | null;
    quantity_before?: number | null;
    quantity_affected?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
  }[];
  order_documents?: {
    id: number;
    document_type: string;
    original_filename: string;
    file_url: string;
    created_at?: string | null;
  }[];
  order_activity_logs?: {
    id: number;
    event_type: string;
    message: string;
    created_at?: string | null;
  }[];
  order_notes?: OrderNoteDto[];
  operational_notes?: OrderOperationalNoteDto[];
  has_internal_note?: boolean;
  has_customer_comment?: boolean;
  latest_internal_note_preview?: string | null;
  latest_customer_comment_preview?: string | null;
};

const PAYMENT_METHOD_PRESETS = ["przelew", "pobranie", "BLIK", "karta", "gotówka"] as const;
const PAYMENT_STATUS_PRESETS = ["nieopłacone", "opłacone", "częściowo", "zwrot"] as const;

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

function grossFromNetLine(net: number, vatPct: number | null | undefined): number {
  const v = Number(vatPct ?? 0);
  return Math.round(net * (1 + v / 100) * 100) / 100;
}

function grossFromNetUnit(net: number, vatPct: number | null | undefined): number {
  const v = Number(vatPct ?? 0);
  return Math.round(net * (1 + v / 100) * 10000) / 10000;
}

function orderOfficePinStorageKey(orderId: number): string {
  return `order_office_pin:${orderId}`;
}

function formatExternalIdSnippet(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s.length > 28 ? `${s.slice(0, 14)}…${s.slice(-8)}` : s;
}

const ORDER_DETAIL_HEADER_ICON_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25 disabled:pointer-events-none disabled:opacity-30";

function uniqJoinedAddressParts(parts: unknown[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = typeof p === "string" ? p.trim() : p != null ? String(p).trim() : "";
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.join(" ");
}

function parseShippingAddressBlock(json: string | null | undefined): string[] {
  if (!json?.trim()) return ["—"];
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const ship = (root.shipping ?? root.delivery) as Record<string, unknown> | undefined;
    if (ship && typeof ship === "object") {
      const mainStreet = uniqJoinedAddressParts([ship.street, ship.street_name, ship.address, ship.Ulica]);
      const s2raw = ship.street2 ?? ship.address_extra;
      const s2 = typeof s2raw === "string" ? s2raw.trim() : s2raw != null ? String(s2raw).trim() : "";
      const streetBlocks: string[] = [];
      if (mainStreet) streetBlocks.push(mainStreet);
      if (s2 && s2.toLowerCase() !== mainStreet.toLowerCase()) streetBlocks.push(s2);
      const streetLine = streetBlocks.join(", ");
      const parts = [
        ship.name,
        streetLine,
        uniqJoinedAddressParts([ship.postal_code, ship.postcode, ship.zip, ship["Kod pocztowy"]]),
        uniqJoinedAddressParts([ship.city, ship.town, ship.Miejscowość]),
        uniqJoinedAddressParts([ship.country, ship.Kraj]),
      ]
        .map((x) => (typeof x === "string" ? x.trim() : x != null ? String(x).trim() : ""))
        .filter(Boolean);
      if (parts.length) return parts;
    }
    const bill = root.billing as Record<string, unknown> | undefined;
    if (bill && typeof bill === "object") {
      const parts = [
        bill.name,
        uniqJoinedAddressParts([bill.street, bill.street_name, bill.Ulica]),
        uniqJoinedAddressParts([bill.postal_code, bill.postcode, bill["Kod pocztowy"]]),
        uniqJoinedAddressParts([bill.city, bill.Miejscowość]),
        uniqJoinedAddressParts([bill.country, bill.Kraj]),
      ]
        .map((x) => (typeof x === "string" ? x.trim() : x != null ? String(x).trim() : ""))
        .filter(Boolean);
      if (parts.length) return parts;
    }
  } catch {
    /* ignore */
  }
  return ["—"];
}

type ShippingAddrDraft = { name: string; street: string; city: string; postal: string; country: string };

function shippingFromOrderJson(json: string | null | undefined): ShippingAddrDraft {
  const empty: ShippingAddrDraft = { name: "", street: "", city: "", postal: "", country: "" };
  if (!json?.trim()) return empty;
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const ship = (root.shipping ?? root.delivery) as Record<string, unknown> | undefined;
    if (!ship || typeof ship !== "object") return empty;
    const street = uniqJoinedAddressParts([ship.street, ship.street_name, ship.address, ship.Ulica]);
    const s2raw = ship.street2 ?? ship.address_extra;
    const street2 = typeof s2raw === "string" ? s2raw.trim() : "";
    let streetCombined = street;
    if (street2 && street2.toLowerCase() !== street.toLowerCase()) {
      streetCombined = street ? `${street}, ${street2}`.trim() : street2;
    }
    const city = uniqJoinedAddressParts([ship.city, ship.town, ship.Miejscowość]) || "";
    const postal = uniqJoinedAddressParts([ship.postal_code, ship.postcode, ship.zip, ship["Kod pocztowy"]]) || "";
    const country = uniqJoinedAddressParts([ship.country, ship.Kraj]) || "";
    const name = typeof ship.name === "string" ? ship.name.trim() : "";
    return {
      name,
      street: streetCombined,
      city: city ?? "",
      postal: postal ?? "",
      country: country ?? "",
    };
  } catch {
    return empty;
  }
}

function parsePhoneEmail(json: string | null | undefined): { phone: string; email: string } {
  let phone = "—";
  let email = "—";
  if (!json?.trim()) return { phone, email };
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    for (const key of ["shipping", "billing", "customer", "delivery"]) {
      const block = root[key] as Record<string, unknown> | undefined;
      if (!block || typeof block !== "object") continue;
      const p = block.phone ?? block.mobile ?? block.tel ?? block.Telefon;
      const e = block.email ?? block.mail ?? block.Email;
      if (typeof p === "string" && p.trim() && phone === "—") phone = p.trim();
      if (typeof e === "string" && e.trim() && email === "—") email = e.trim();
    }
  } catch {
    /* ignore */
  }
  return { phone, email };
}

type BillingInvoiceParsed = {
  companyName: string;
  nip: string;
  streetLine: string;
  cityLine: string;
  email: string;
};

function parseBillingInvoice(json: string | null | undefined): BillingInvoiceParsed {
  const empty: BillingInvoiceParsed = {
    companyName: "",
    nip: "",
    streetLine: "",
    cityLine: "",
    email: "",
  };
  if (!json?.trim()) return empty;
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const bill = root.billing as Record<string, unknown> | undefined;
    if (!bill || typeof bill !== "object") return empty;
    const companyName = String(bill.company_name ?? bill.name ?? bill.firma ?? "").trim();
    const nip = String(bill.nip ?? bill.NIP ?? bill.tax_id ?? "").trim();
    const email = String(bill.email ?? bill.mail ?? "").trim();
    const street = uniqJoinedAddressParts([bill.street, bill.street_name, bill.Ulica]);
    const street2 = typeof bill.address_extra === "string" ? bill.address_extra.trim() : "";
    const streetLine = street2 && street2.toLowerCase() !== street.toLowerCase() ? `${street} / ${street2}`.trim() : street;
    const postal = uniqJoinedAddressParts([bill.postal_code, bill.postcode, bill.zip, bill["Kod pocztowy"]]);
    const city = uniqJoinedAddressParts([bill.city, bill.Miejscowość]);
    const country = uniqJoinedAddressParts([bill.country, bill.Kraj]);
    const cityLine = [postal, city, country].filter(Boolean).join(" ");
    return {
      companyName,
      nip,
      streetLine,
      cityLine,
      email,
    };
  } catch {
    return empty;
  }
}

type ShippingExtrasParsed = {
  company: string;
  phone: string;
  email: string;
  pickupPoint: string;
  pickupCode: string;
};

function parseShippingExtras(json: string | null | undefined): ShippingExtrasParsed {
  const empty: ShippingExtrasParsed = { company: "", phone: "", email: "", pickupPoint: "", pickupCode: "" };
  if (!json?.trim()) return empty;
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const ship = (root.shipping ?? root.delivery) as Record<string, unknown> | undefined;
    if (!ship || typeof ship !== "object") return empty;
    return {
      company: String(ship.company_name ?? ship.company ?? ship.firma ?? "").trim(),
      phone: String(ship.phone ?? ship.mobile ?? ship.tel ?? "").trim(),
      email: String(ship.email ?? ship.mail ?? "").trim(),
      pickupPoint: String(
        ship.pickup_point_name ??
          ship.parcel_locker_name ??
          ship.point_name ??
          ship.locker_name ??
          ship.apm_name ??
          "",
      ).trim(),
      pickupCode: String(ship.pickup_code ?? ship.collection_code ?? ship.access_code ?? ship.locker_code ?? "").trim(),
    };
  } catch {
    return empty;
  }
}

function paymentStatusIsPaid(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  if (!s) return false;
  if (/nieopłac|nieoplac|unpaid|częściowo|partial|nie\s*zapłac/.test(s)) return false;
  return /opłac|zapłac|paid|complete|zapłacono|opłacone|tak/.test(s);
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">{title}</h3>
      <div className="space-y-2 text-sm text-slate-800">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function SummaryDashboardCard({
  title,
  children,
  right,
  className,
  contentClassName,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={
        className ??
        "rounded-md border border-slate-200 bg-white p-5 shadow-sm"
      }
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{title}</h3>
        {right}
      </div>
      <div className={contentClassName ?? ""}>{children}</div>
    </section>
  );
}

const SUMMARY_TOP_CARD_SHELL =
  "rounded-md border border-slate-200 bg-white p-5 shadow-sm";

function SummaryCompactRow({
  label,
  value,
  actions,
}: {
  label: string;
  value: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <div className="flex min-w-0 items-start justify-end gap-1.5 text-right">
        <div className="min-w-0 font-medium leading-snug text-slate-900">{value}</div>
        {actions}
      </div>
    </div>
  );
}

type OrderDocTableKindTone = "fa" | "pa" | "rz" | "lp" | "na";

type OrderDocTableRow = {
  id: string;
  name: string;
  type: string;
  status: "approved" | "pending";
  date: string;
  fileUrl?: string;
  mimeType?: string;
  typeLabel?: { abbr: string; name: string; tone: OrderDocTableKindTone };
};

function orderDocRowIsPdfOrImage(row: OrderDocTableRow): boolean {
  const mt = (row.mimeType ?? "").toLowerCase();
  if (mt.includes("pdf") || mt.startsWith("image/")) return true;
  const n = row.name.toLowerCase();
  const path = (row.fileUrl ?? "").split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".pdf") || /\.(png|jpe?g|gif|webp|svg)$/i.test(path)) return true;
  if (n.endsWith(".pdf") || /\.(png|jpe|jpeg|jpg|gif|webp|svg)$/i.test(n)) return true;
  return false;
}

function orderDocKindToneClass(tone: OrderDocTableKindTone): string {
  switch (tone) {
    case "fa":
      return "bg-emerald-600";
    case "pa":
      return "bg-amber-500";
    case "rz":
      return "bg-slate-500";
    case "lp":
      return "bg-blue-600";
    default:
      return "bg-slate-400";
  }
}

const ORDER_DOCS_SECTION_TYPES = new Set([
  "PARAGON",
  "PROFORMA",
  "FAKTURA",
  "RACHUNEK",
  "KOREKTA",
  "DOKUMENT_SPRZEDAZY",
]);

const DOCUMENTS_GRID = "grid grid-cols-[40px_160px_180px_1fr_120px] items-center gap-x-4";

function guessMimeFromFilename(name: string): string | undefined {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  return undefined;
}

function orderDocumentTypeToLabel(code: string): NonNullable<OrderDocTableRow["typeLabel"]> {
  const c = (code || "").toUpperCase();
  switch (c) {
    case "PARAGON":
      return { abbr: "Pa", name: "Paragon", tone: "pa" };
    case "PROFORMA":
      return { abbr: "Pr", name: "Proforma", tone: "rz" };
    case "FAKTURA":
      return { abbr: "Fa", name: "Faktura", tone: "fa" };
    case "RACHUNEK":
      return { abbr: "Ra", name: "Rachunek", tone: "rz" };
    case "KOREKTA":
      return { abbr: "Ko", name: "Korekta", tone: "na" };
    case "DOKUMENT_SPRZEDAZY":
      return { abbr: "DS", name: "Dokument sprzedaży", tone: "fa" };
    case "ZALACZNIK":
      return { abbr: "Zł", name: "Załącznik", tone: "na" };
    case "LIST_PRZEWOZOWY":
      return { abbr: "LP", name: "List przewozowy", tone: "lp" };
    default:
      return { abbr: "—", name: c || "—", tone: "na" };
  }
}

type OrderDocModalType = (typeof ORDER_DOCUMENT_MODAL_TYPES)[number];

const DEFAULT_DOC_MODAL_TYPE: OrderDocModalType = "FAKTURA";

function OrderDocTableRowActions({
  row,
  onPreview,
  onPrint,
  onDownload,
  onEmail,
  onDelete,
}: {
  row: OrderDocTableRow;
  onPreview: (row: OrderDocTableRow) => void;
  onPrint: (row: OrderDocTableRow) => void;
  onDownload: (row: OrderDocTableRow) => void;
  onEmail: (row: OrderDocTableRow) => void;
  onDelete: (row: OrderDocTableRow) => void;
}) {
  return (
    <div className="flex w-full items-center justify-end gap-2">
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100" onClick={() => onPreview(row)}>
        <Eye className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100" onClick={() => onPrint(row)}>
        <Printer className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100" onClick={() => onDownload(row)}>
        <Download className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100" onClick={() => onEmail(row)}>
        <Mail className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(row)}>
        <Trash2 className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

function OrderDocFilesTableSection({
  title,
  rows,
  showTypeColumn,
  onUploadFiles,
  onToolbarPrint,
  onToolbarEmail,
  onPreview,
  onPrint,
  onDownload,
  onEmail,
  onDelete,
}: {
  title: string;
  rows: OrderDocTableRow[];
  showTypeColumn: boolean;
  onUploadFiles?: (files: FileList | null) => void;
  onToolbarPrint?: () => void;
  onToolbarEmail?: () => void;
  onPreview: (row: OrderDocTableRow) => void;
  onPrint: (row: OrderDocTableRow) => void;
  onDownload: (row: OrderDocTableRow) => void;
  onEmail: (row: OrderDocTableRow) => void;
  onDelete: (row: OrderDocTableRow) => void;
}) {
  const uploadInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
        <input type="file" ref={uploadInputRef} className="hidden" onChange={(e) => { onUploadFiles?.(e.target.files); e.target.value = ""; }} />
      </div>
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center space-x-4 text-sm">
         <label className="flex items-center font-medium cursor-pointer text-slate-600"><input type="checkbox" className="mr-2"/> wykonaj</label>
         <button className="text-slate-500 hover:text-slate-900" onClick={() => onToolbarPrint?.()}><Printer size={16}/></button>
         <button className="text-slate-500 hover:text-slate-900" onClick={() => onToolbarEmail?.()}><Mail size={16}/></button>
         <button className="text-slate-500 hover:text-slate-900" onClick={() => uploadInputRef.current?.click()}><Upload size={16}/></button>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-[10px] text-slate-400 uppercase font-bold border-b border-slate-100 bg-slate-50/50">
          <tr>
            <th className="px-5 py-3 w-10"></th>
            <th className="px-5 py-3 w-40">DATA</th>
            <th className="px-5 py-3 w-48">RODZAJ</th>
            <th className="px-5 py-3">NAZWA DOKUMENTU</th>
            <th className="px-5 py-3 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-5 py-4"><input type="checkbox" className="rounded border-slate-300"/></td>
              <td className="px-5 py-4 text-slate-500">{row.date}</td>
              <td className="px-5 py-4">
                {showTypeColumn && row.typeLabel ? (
                  <div className="flex items-center">
                    <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded mr-2 ${orderDocKindToneClass(row.typeLabel.tone)}`}>{row.typeLabel.abbr}</span> 
                    {row.typeLabel.name}
                  </div>
                ) : <span className="text-slate-400">—</span>}
              </td>
              <td className="px-5 py-4">
                <span className="font-medium text-slate-800 break-words">{row.name}</span>
                <span className={`ml-3 px-2 py-0.5 rounded text-[10px] font-bold ${row.status === "approved" ? "bg-slate-800 text-white" : "bg-slate-100 border border-slate-200 text-slate-500 font-medium"}`}>
                  {row.status === "approved" ? "Zatwierdzony" : "Niezatwierdzony"}
                </span>
              </td>
              <td className="px-5 py-4 text-right text-slate-400">
                <OrderDocTableRowActions row={row} onPreview={onPreview} onPrint={onPrint} onDownload={onDownload} onEmail={onEmail} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type WmsSidebarTimeCell = { title: string; value: string; statusChip: string };

function WmsOperationTimesKpiPanel({ cells }: { cells: readonly WmsSidebarTimeCell[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-5">Czasy operacji (WMS)</h3>
      <div className="grid grid-cols-2 gap-4">
        {cells.map((cell) => (
          <div key={cell.title} className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 flex flex-col justify-between">
            <p className="text-xs text-slate-500 mb-2">{cell.title}</p>
            <div>
              <p className="text-2xl font-black text-slate-900">{cell.value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{cell.statusChip}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DETAIL_TABS = [
  { id: "summary", label: "Podsumowanie" },
  { id: "products", label: "Produkty i magazyn" },
  { id: "comms", label: "Komunikacja" },
  { id: "docs", label: "Dokumenty i pliki" },
  { id: "logs", label: "Logi" },
] as const;

type DetailTabId = (typeof DETAIL_TABS)[number]["id"];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[] | null>(null);
  const [panelSaving, setPanelSaving] = useState(false);
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
  const [returnsComplaintsOpen, setReturnsComplaintsOpen] = useState(false);
  const returnsComplaintsRef = useRef<HTMLDivElement>(null);
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
  const [summaryLogSearch, setSummaryLogSearch] = useState("");
  const [orderRabatMode, setOrderRabatMode] = useState<"pct" | "pln">("pct");
  const [orderRabatDraft, setOrderRabatDraft] = useState("");
  const [orderRabatSaving, setOrderRabatSaving] = useState(false);

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
    if (warehouseId == null) {
      setPanelSummary(null);
      return;
    }
    try {
      const [s, sg] = await Promise.all([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId),
        getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouseId),
      ]);
      setPanelSummary(s);
      setPanelSubgroups(sg);
    } catch {
      setPanelSummary(null);
      setPanelSubgroups(null);
    }
  }, [warehouseId]);

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
    if (warehouseId == null) {
      setShippingMethods([]);
      return;
    }
    void getShippingMethods({
      tenant_id: DAMAGE_TENANT_ID,
      warehouse_id: warehouseId,
      active_only: false,
    })
      .then((list) =>
        setShippingMethods(list.map((x) => ({ id: x.id, name: x.name, is_active: x.is_active }))),
      )
      .catch(() => setShippingMethods([]));
  }, [warehouseId]);

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

  useEffect(() => {
    if (!returnsComplaintsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (returnsComplaintsRef.current?.contains(t)) return;
      setReturnsComplaintsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [returnsComplaintsOpen]);

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
      const lineNetN = pickFirstFinite(it.line_net_total, it.total_price, unitNetN != null ? unitNetN * qty : null);
      const unitGrossN = pickFirstFinite(
        it.unit_price_gross,
        unitNetN != null ? grossFromNetUnit(unitNetN, it.vat_percent) : null,
      );
      const lineGrossN = pickFirstFinite(
        it.line_gross_total,
        lineNetN != null ? grossFromNetLine(lineNetN, it.vat_percent) : null,
      );
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

  type SummaryPanelLogRow = {
    id: string | number;
    at: string;
    kind: string;
    msg: string;
    severity: "info" | "warn" | "error";
  };

  const summaryPanelLogs = useMemo((): SummaryPanelLogRow[] => {
    if (!order) return [];
    const rows: SummaryPanelLogRow[] = [
      {
        id: "sys-created",
        at: formatDetailDate(order.created_at),
        kind: "SYSTEM",
        msg: `Utworzono zamówienie (ID ${order.id})`,
        severity: "info",
      },
      {
        id: "sys-source",
        at: "—",
        kind: "SOURCE",
        msg: `Źródło: ${(order.source ?? "").trim() || "—"}`,
        severity: "info",
      },
    ];
    for (const log of order.order_activity_logs ?? []) {
      const msg = (log.message ?? "").trim() || "—";
      let severity: SummaryPanelLogRow["severity"] = "info";
      if (/^(błąd|error)/i.test(msg)) severity = "error";
      else if (/^(ważne|warn)/i.test(msg)) severity = "warn";
      rows.push({
        id: log.id,
        at: formatDetailDate(log.created_at ?? null),
        kind: (log.event_type ?? "").trim() || "—",
        msg,
        severity,
      });
    }
    const q = summaryLogSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.msg.toLowerCase().includes(q) ||
        r.kind.toLowerCase().includes(q) ||
        r.at.toLowerCase().includes(q),
    );
  }, [order, summaryLogSearch]);

  const dateLine = order ? formatDetailDate(order.order_date ?? order.created_at) : "—";

  const productsSubtotal = useMemo(() => {
    if (!order?.items?.length) return null;
    let sum = 0;
    for (const it of order.items) {
      if (it.unit_price == null || Number.isNaN(Number(it.unit_price))) return null;
      sum += Number(it.unit_price) * (it.quantity || 0);
    }
    return sum;
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

  const handleOrderDocPrint = useCallback((row: OrderDocTableRow) => {
    if (row.fileUrl) {
      window.open(row.fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    console.log("[print] brak pliku — brak podglądu do druku", row.id, row.name);
  }, []);

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

  const inpSm = "mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900";

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center gap-2 text-slate-500 bg-white p-6">
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
    productsSubtotal != null ? formatMoney(productsSubtotal, order.currency) : formatMoney(order.value, order.currency);
  const productsAfterDiscount =
    order.total_products_value != null && Number.isFinite(Number(order.total_products_value))
      ? Number(order.total_products_value)
      : productsSubtotal;
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
      <div className={`hidden min-h-0 min-w-0 shrink-0 flex-col gap-2 border-r border-slate-200 bg-slate-50 lg:flex ${isStatusPanelCollapsed ? "w-14" : "w-[260px]"}`}>
         <OrderStatusSidebar
            warehouseId={warehouseId}
            panelSummary={panelSummary}
            panelSubgroups={panelSubgroups}
            panelFilter={sidebarFilter}
            onPanelFilterChange={(f) => navigate("/orders/list", { state: { panelFilter: f } })}
            chromeVariant="sellasist"
            collapsed={isStatusPanelCollapsed}
            parentScrollContainer
            titleTrailing={
              <button
                type="button"
                onClick={() => setIsStatusPanelCollapsed((v) => !v)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-100"
              >
                <ChevronLeft className={`h-4 w-4 transition-transform ${isStatusPanelCollapsed ? "rotate-180" : ""}`} />
              </button>
            }
          />
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-white">
        <div className="w-full flex-col lg:flex-row lg:items-start p-6 pb-0 max-w-[1600px] mx-auto">
            <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Ścieżka nawigacji">
              <Link to="/dashboard" className="inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800">
                <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </Link>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
              <Link to="/orders/list" className="font-medium text-slate-500 transition hover:text-slate-800">Zamówienia</Link>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
              <span className="font-medium text-slate-900">#{order.number ?? order.id}</span>
            </nav>

            <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 lg:flex-nowrap lg:gap-x-3 pb-4">
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" disabled={prevOrderId == null} onClick={() => prevOrderId != null && navigate(`/orders/${prevOrderId}`, { state: location.state })} className={ORDER_DETAIL_HEADER_ICON_BTN}>
                      <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} />
                    </button>
                    <button type="button" disabled={nextOrderId == null} onClick={() => nextOrderId != null && navigate(`/orders/${nextOrderId}`, { state: location.state })} className={ORDER_DETAIL_HEADER_ICON_BTN}>
                      <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} />
                    </button>
                    <div className="mx-0.5 hidden h-6 w-px shrink-0 bg-slate-200 sm:block" />
                    <OrderPriorityFlamePicker orderId={order.id} priorityColor={order.priority_color ?? null} compactTrigger onUpdated={(next) => setOrder((prev) => (prev ? { ...prev, priority_color: next } : prev))} />
                  </div>

                  <div className="min-w-0 flex-1 lg:min-w-[12rem] flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-slate-500 uppercase tracking-wide">Zamówienie</span>
                      <span className="text-2xl font-bold tracking-tight text-slate-900">{order.number ?? order.id}</span>
                      <span className="text-[11px] text-slate-400">{dateLine}</span>
                      {formatExternalIdSnippet(order.external_id) && <span className="text-[11px] text-slate-400">ID zew: {formatExternalIdSnippet(order.external_id)}</span>}
                      {(order.source ?? "").trim() && <span className="hidden text-[11px] text-slate-400 md:inline">{(order.source ?? "").trim()}</span>}
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => { if (!order?.id) return; setOfficePin((p) => { const next = !p; try { if (next) window.localStorage.setItem(orderOfficePinStorageKey(order.id), "1"); else window.localStorage.removeItem(orderOfficePinStorageKey(order.id)); } catch {} return next; }); }} className={`${ORDER_DETAIL_HEADER_ICON_BTN} ${officePin ? "border-amber-400 bg-amber-50 text-amber-600" : ""}`}>
                        <Bookmark className={`h-4 w-4 shrink-0 ${officePin ? "fill-current" : ""}`} strokeWidth={2} />
                      </button>
                      <button type="button" onClick={() => { setActiveTab("summary"); window.setTimeout(() => { document.getElementById("order-summary-operational-notes")?.scrollIntoView({ behavior: "smooth" }); }, 0); }} className={`${ORDER_DETAIL_HEADER_ICON_BTN} ${order?.has_internal_note ? "border-red-300 bg-red-50 text-red-700" : ""}`}>
                        <Pin className="h-4 w-4 shrink-0" strokeWidth={2} />
                      </button>
                      <div className="relative" ref={returnsComplaintsRef}>
                        <button type="button" onClick={() => setReturnsComplaintsOpen((v) => !v)} className={ORDER_DETAIL_HEADER_ICON_BTN}>
                          <MessageSquareWarning className="h-4 w-4 shrink-0" strokeWidth={2} />
                        </button>
                      </div>
                      <button type="button" onClick={() => { setActiveTab("comms"); window.setTimeout(() => { document.getElementById("order-comms-note")?.focus(); }, 0); }} className={`${ORDER_DETAIL_HEADER_ICON_BTN} ${order?.has_customer_comment ? "border-emerald-300 bg-emerald-50 text-emerald-700" : ""}`}>
                        <Mail className="h-4 w-4 shrink-0" strokeWidth={2} />
                        {order?.has_customer_comment && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>}
                      </button>
                      <div className="w-px h-6 bg-slate-200 mx-1"></div>
                      <button type="button" onClick={() => window.print()} className={ORDER_DETAIL_HEADER_ICON_BTN}><Printer className="h-4 w-4 shrink-0" strokeWidth={2} /></button>
                      <Link to={WMS_ROUTES.packingOrder(order.id)} className="inline-flex items-center rounded-md bg-blue-600 px-4 py-1.5 text-sm font-bold text-white transition hover:bg-blue-700">Spakuj</Link>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center min-w-[200px]">
                    {warehouseId != null ? (
                      <OrderDetailPrimaryStatusDropdown variant="compact" currentStatus={order.order_ui_status ?? null} panelSummary={panelSummary} panelSubgroups={panelSubgroups} saving={panelSaving} onSelectStatus={async (subStatusId) => { setPanelSaving(true); try { const updated = await patchOrderUiStatus(order.id, DAMAGE_TENANT_ID, warehouseId, subStatusId); setOrder((prev) => prev ? { ...prev, order_ui_status: updated.order_ui_status ?? null } : prev); await loadPanelSummary(); } finally { setPanelSaving(false); } }} />
                    ) : panelOrderStatusBrief ? (
                      <OrderUiStatusConfigRowPresent status={panelOrderStatusBrief} variant="compact" />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">WMS</span>
                    {wmsDualWorkflow ? (
                      <div className="flex gap-2">
                        <span className={`inline-flex items-center rounded border px-2.5 py-1 text-[10px] font-bold ${wmsDualWorkflow.pickedSum >= wmsDualWorkflow.total && wmsDualWorkflow.total > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
                          Zbieranie {wmsDualWorkflow.pickedSum}/{wmsDualWorkflow.total}
                        </span>
                        <span className={`inline-flex items-center rounded border px-2.5 py-1 text-[10px] font-bold ${wmsDualWorkflow.packed >= wmsDualWorkflow.total && wmsDualWorkflow.total > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
                          Pakowanie {wmsDualWorkflow.packed}/{wmsDualWorkflow.total}
                        </span>
                      </div>
                    ) : <span className="text-xs text-slate-400">Brak postępu</span>}
                  </div>
                </div>

                <div className="border-b border-slate-200 mt-2">
                  <div className="flex gap-6 overflow-x-auto">
                    {DETAIL_TABS.map((t) => (
                      <button key={t.id} onClick={() => setActiveTab(t.id)} className={`pb-3 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px ${ activeTab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800" }`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-auto bg-white p-6">
          <div className="max-w-[1600px] mx-auto">
            {activeTab === "summary" ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                <div className="min-w-0 space-y-6">
                  {/* Trzy główne kafelki obok siebie */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <SummaryDashboardCard
                      className={SUMMARY_TOP_CARD_SHELL}
                      title="Dostawa i płatność"
                      right={
                        <span className="flex items-center gap-2">
                          <button type="button" className="text-slate-400 hover:text-slate-800" onClick={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); }}><RefreshCw className="h-4 w-4" strokeWidth={2}/></button>
                        </span>
                      }
                    >
                      <SummaryCompactRow label="Metoda płatności" value={<select className={inpSm} value={payMethodDraft} onChange={(e) => setPayMethodDraft(e.target.value)}><option value="">—</option>{Array.from(new Set([...PAYMENT_METHOD_PRESETS, payMethodDraft].filter(Boolean))).map((m) => (<option key={m} value={m}>{m}</option>))}</select>} />
                      <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
                        <span className="text-slate-500">Status płatności</span>
                        <select className={`rounded-md border px-2 py-1 text-xs font-bold outline-none ${paymentStatusIsPaid(payStatusDraft) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white"}`} value={payStatusDraft} onChange={(e) => setPayStatusDraft(e.target.value)}><option value="">—</option>{Array.from(new Set([...PAYMENT_STATUS_PRESETS, payStatusDraft].filter(Boolean))).map((m) => (<option key={m} value={m}>{m}</option>))}</select>
                      </div>
                      <label className="flex flex-col gap-1 border-b border-slate-100 py-2 text-sm text-slate-500 last:border-b-0">
                        <span className="flex items-center gap-2"><Truck className="h-4 w-4" /> Sposób wysyłki</span>
                        <select className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-orange-600" value={shipDraft} disabled={warehouseId == null} onChange={(e) => setShipDraft(e.target.value)}><option value="">— brak —</option>{shippingMethods.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}</select>
                      </label>
                      {warehouseId != null && (
                        <div className="mt-2 flex justify-end gap-2">
                          <button type="button" className="rounded border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700" onClick={() => { setShipDraft(order.shipping_method_id?.trim() ?? ""); setPayMethodDraft((order.panel_payment_method ?? "").trim()); setPayStatusDraft((order.panel_payment_status ?? "").trim()); }}>Anuluj</button>
                          <button type="button" disabled={shipPaySaving} onClick={() => { setShipPaySaving(true); void patchOrder(order.id, { shipping_method_id: shipDraft.trim() || null, payment_method: payMethodDraft.trim() || null, payment_status: payStatusDraft.trim() || null }).then(() => reloadOrderById(order.id)).finally(() => setShipPaySaving(false)); }} className="rounded bg-slate-900 px-4 py-1 text-xs font-bold text-white">{shipPaySaving ? "..." : "Zapisz"}</button>
                        </div>
                      )}
                    </SummaryDashboardCard>

                    <SummaryDashboardCard
                      className={SUMMARY_TOP_CARD_SHELL}
                      title="Adres dostawy"
                      right={warehouseId != null && !addressEditing ? <button onClick={() => { setAddrDraft(shippingFromOrderJson(order.addresses_json)); setAddressEditing(true); }} className="text-slate-400 hover:text-slate-800"><Pencil className="h-4 w-4" strokeWidth={2}/></button> : null}
                    >
                      {addressEditing ? (
                        <div className="space-y-2 text-sm">
                          <label className="flex flex-col text-slate-600">Imię i nazwisko<input className={inpSm} value={addrDraft.name} onChange={(e) => setAddrDraft((d) => ({ ...d, name: e.target.value }))} /></label>
                          <label className="flex flex-col text-slate-600">Ulica<input className={inpSm} value={addrDraft.street} onChange={(e) => setAddrDraft((d) => ({ ...d, street: e.target.value }))} /></label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex flex-col text-slate-600">Kod<input className={inpSm} value={addrDraft.postal} onChange={(e) => setAddrDraft((d) => ({ ...d, postal: e.target.value }))} /></label>
                            <label className="flex flex-col text-slate-600">Miasto<input className={inpSm} value={addrDraft.city} onChange={(e) => setAddrDraft((d) => ({ ...d, city: e.target.value }))} /></label>
                          </div>
                          <label className="flex flex-col text-slate-600">Kraj<input className={inpSm} value={addrDraft.country} onChange={(e) => setAddrDraft((d) => ({ ...d, country: e.target.value }))} /></label>
                          <div className="flex justify-end gap-2 pt-2">
                            <button className="rounded border border-slate-200 px-3 py-1 text-xs font-bold" onClick={() => { setAddrDraft(shippingFromOrderJson(order.addresses_json)); setAddressEditing(false); }}>Anuluj</button>
                            <button disabled={addressSaving || warehouseId == null} className="rounded bg-slate-900 px-4 py-1 text-xs font-bold text-white" onClick={() => { setAddressSaving(true); void patchOrder(order.id, { shipping_name: addrDraft.name.trim() || null, shipping_street: addrDraft.street.trim() || null, shipping_city: addrDraft.city.trim() || null, shipping_postal_code: addrDraft.postal.trim() || null, shipping_country: addrDraft.country.trim() || null }).then(() => reloadOrderById(order.id)).finally(() => { setAddressSaving(false); setAddressEditing(false); }); }}>{addressSaving ? "..." : "Zapisz"}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1 text-sm text-slate-800">
                          <p className="font-bold text-base text-slate-900">{summaryShippingName}</p>
                          {shippingExtras?.company && <p className="text-slate-600">{shippingExtras.company}</p>}
                          <p className="text-slate-600 flex items-center pt-1"><Phone size={14} className="mr-2 text-slate-400"/> {shippingExtras?.phone || contact.phone}</p>
                          <p className="text-slate-600 flex items-center pb-2 border-b border-slate-100"><Mail size={14} className="mr-2 text-slate-400"/> <span className="truncate">{shippingExtras?.email || contact.email}</span></p>
                          <div className="pt-2">
                            {contact.addressLines.length > 0 && contact.addressLines[0] !== "—" ? contact.addressLines.map((ln, i) => <p key={`ship-${i}`}>{ln}</p>) : <p className="text-slate-500">Brak adresu.</p>}
                            {shippingExtras?.pickupPoint && <p className="font-bold text-slate-700 mt-2">{shippingExtras.pickupPoint}</p>}
                            {shippingExtras?.pickupCode && <p className="text-slate-700">Kod odbioru: {shippingExtras.pickupCode}</p>}
                          </div>
                        </div>
                      )}
                    </SummaryDashboardCard>

                    <SummaryDashboardCard
                      className={SUMMARY_TOP_CARD_SHELL}
                      title={summaryDocEditing ? (docDraft.document_type === "INVOICE" ? "Faktura" : "Paragon") : panelDocumentLabel}
                      right={warehouseId != null && !summaryDocEditing ? <button onClick={() => { const inv = parseBillingInvoice(order.addresses_json); const t = (order.panel_document_type ?? "").trim().toUpperCase(); setDocDraft({ document_type: t === "INVOICE" ? "INVOICE" : "PARAGON", sales_document_number: (order.sales_document_number ?? "").trim(), company_name: inv.companyName, nip: inv.nip, billing_email: inv.email }); setSummaryDocEditing(true); }} className="text-slate-400 hover:text-slate-800"><Pencil className="h-4 w-4" strokeWidth={2}/></button> : null}
                    >
                      {summaryDocEditing ? (
                        <div className="space-y-2 text-sm">
                          <label className="flex flex-col text-slate-600">Rodzaj dokumentu<select className={inpSm} value={docDraft.document_type} onChange={(e) => setDocDraft((d) => ({ ...d, document_type: e.target.value === "INVOICE" ? "INVOICE" : "PARAGON" }))}><option value="PARAGON">Paragon</option><option value="INVOICE">Faktura</option></select></label>
                          <label className="flex flex-col text-slate-600">Numer dokumentu<input className={inpSm} value={docDraft.sales_document_number} onChange={(e) => setDocDraft((d) => ({ ...d, sales_document_number: e.target.value }))} /></label>
                          {docDraft.document_type === "INVOICE" && (
                            <>
                              <label className="flex flex-col text-slate-600">Firma<input className={inpSm} value={docDraft.company_name} onChange={(e) => setDocDraft((d) => ({ ...d, company_name: e.target.value }))} /></label>
                              <label className="flex flex-col text-slate-600">NIP<input className={inpSm} value={docDraft.nip} onChange={(e) => setDocDraft((d) => ({ ...d, nip: e.target.value }))} /></label>
                              <label className="flex flex-col text-slate-600">E-mail<input type="email" className={inpSm} value={docDraft.billing_email} onChange={(e) => setDocDraft((d) => ({ ...d, billing_email: e.target.value }))} /></label>
                            </>
                          )}
                          <div className="flex justify-end gap-2 pt-2">
                            <button className="rounded border border-slate-200 px-3 py-1 text-xs font-bold" onClick={() => { const inv = parseBillingInvoice(order.addresses_json); const t = (order.panel_document_type ?? "").trim().toUpperCase(); setDocDraft({ document_type: t === "INVOICE" ? "INVOICE" : "PARAGON", sales_document_number: (order.sales_document_number ?? "").trim(), company_name: inv.companyName, nip: inv.nip, billing_email: inv.email }); setSummaryDocEditing(false); }}>Anuluj</button>
                            <button disabled={docSaving || warehouseId == null} className="rounded bg-slate-900 px-4 py-1 text-xs font-bold text-white" onClick={() => { setDocSaving(true); const isInv = docDraft.document_type === "INVOICE"; void patchOrder(order.id, { document_type: docDraft.document_type, sales_document_number: docDraft.sales_document_number.trim() || null, company_name: isInv ? docDraft.company_name.trim() || null : null, nip: isInv ? docDraft.nip.trim() || null : null, email: isInv ? docDraft.billing_email.trim() || null : null }).then(() => reloadOrderById(order.id)).finally(() => { setDocSaving(false); setSummaryDocEditing(false); }); }}>{docSaving ? "..." : "Zapisz"}</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <SummaryCompactRow label="Rodzaj" value={panelDocumentLabel} />
                          <SummaryCompactRow label="Numer" value={<span className="font-mono text-blue-600 hover:underline cursor-pointer">{(order.sales_document_number ?? "").trim() || "—"}</span>} />
                          {(order.panel_document_type ?? "").trim().toUpperCase() === "INVOICE" && billingInvoice && (billingInvoice.companyName || billingInvoice.nip || billingInvoice.email) && (
                            <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
                              {billingInvoice.companyName && <p className="font-bold text-slate-900">{billingInvoice.companyName}</p>}
                              {billingInvoice.nip && <p>NIP {billingInvoice.nip}</p>}
                              {billingInvoice.email && <p className="break-all">{billingInvoice.email}</p>}
                              {billingInvoice.streetLine && <p>{billingInvoice.streetLine}</p>}
                              {billingInvoice.cityLine && <p>{billingInvoice.cityLine}</p>}
                            </div>
                          )}
                        </>
                      )}
                    </SummaryDashboardCard>
                  </div>

                  <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between mb-4">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Zamówione produkty</h3>
                    </div>
                    <div className="min-w-0 text-sm text-slate-800">
                      <OrderSummaryProductsList compact lines={summaryProductsLines} productEditTenantId={order.tenant_id ?? DAMAGE_TENANT_ID} onLineAction={handleOrderLineMenuAction} />
                    </div>
                  </section>

                  <SummaryDashboardCard title="Dopasowane opakowania" right={<Link to={WMS_ROUTES.packingOrder(order.id)} className="text-slate-400 hover:text-slate-800"><Pencil className="h-4 w-4" strokeWidth={2}/></Link>}>
                    {wmsLoading ? <p className="text-sm text-slate-500">Ładowanie propozycji...</p> : <OrderMatchedPackagingSection card={wmsFulfillment} pairRecommendationColumns />}
                  </SummaryDashboardCard>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <section id="order-summary-operational-notes" className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">Notatki operacyjne</h3>
                      <div className="space-y-2 mb-4">
                        {order.operational_notes && order.operational_notes.length > 0 ? order.operational_notes.map((n) => (
                          <div key={n.id} className="rounded-md bg-yellow-50 border border-yellow-100 p-3 text-sm text-yellow-900">
                            <p className="whitespace-pre-wrap">{n.content}</p>
                            <div className="mt-2 flex gap-2 text-[10px] text-yellow-700 opacity-80 uppercase font-bold tracking-wider">
                              <span>{formatDetailDate(n.created_at ?? null)}</span>
                              <span>·</span>
                              {n.show_in_picking && <span>WMS Zbieranie</span>}
                              {n.show_in_packing && <span>WMS Pakowanie</span>}
                            </div>
                          </div>
                        )) : <p className="text-sm text-slate-500">Brak notatek operacyjnych.</p>}
                      </div>
                      <div className="border-t border-slate-100 pt-4 mt-4">
                        <textarea value={opDraft} onChange={(e) => setOpDraft(e.target.value)} rows={3} placeholder="Treść notatki..." className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white outline-none focus:border-blue-400 mb-3" />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex gap-4 text-sm font-medium text-slate-600">
                            <label className="flex items-center"><input type="checkbox" className="mr-2 rounded border-slate-300 w-4 h-4" checked={opVisPick} onChange={(e) => setOpVisPick(e.target.checked)}/> Zbieranie</label>
                            <label className="flex items-center"><input type="checkbox" className="mr-2 rounded border-slate-300 w-4 h-4" checked={opVisPack} onChange={(e) => setOpVisPack(e.target.checked)}/> Pakowanie</label>
                          </div>
                          <button disabled={opSaving || !opDraft.trim()} onClick={() => void saveOperationalNote()} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">Zapisz</button>
                        </div>
                      </div>
                    </section>

                    <SummaryDashboardCard title="Wiadomość do klienta">
                      <div className="flex gap-2 mb-4">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded text-xs font-bold">✓ E-mail</span>
                        <span className="text-slate-600 border border-slate-200 px-3 py-1 rounded text-xs font-medium cursor-pointer hover:bg-slate-50">SMS</span>
                      </div>
                      <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={4} placeholder="Wpisz treść..." className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white outline-none focus:border-blue-400 mb-4" />
                      <div className="flex justify-between">
                        <button className="text-sm font-medium border border-slate-200 px-4 py-2 rounded text-slate-700 hover:bg-slate-50 shadow-sm flex items-center"><Plus size={16} className="mr-2"/> Dodaj załącznik</button>
                        <button className="bg-orange-500 text-white px-8 py-2 rounded text-sm font-bold hover:bg-orange-600 shadow-sm flex items-center">Wyślij <Send size={16} className="ml-2"/></button>
                      </div>
                    </SummaryDashboardCard>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <SummaryDashboardCard title="Wideo WMS">
                      <table className="w-full text-left text-sm border-t border-slate-100 mt-2">
                        <thead className="text-[10px] font-bold uppercase text-slate-400"><tr><th className="py-2">Data</th><th className="py-2">Typ</th><th className="py-2">Autor</th><th className="py-2">Wygasa</th></tr></thead>
                        <tbody><tr><td colSpan={4} className="py-4 text-center text-slate-500">Brak nagrań.</td></tr></tbody>
                      </table>
                    </SummaryDashboardCard>

                    <SummaryDashboardCard title="WMS — operatorzy">
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 mt-2">
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                          <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase">W zbieraniu</span>
                          <p className="font-bold text-slate-900 mt-2">{(timelinePickEvt?.user_label ?? timelinePickEvt?.title ?? "").trim() || "—"}</p>
                          <p className="text-xs text-slate-500">{timelinePickEvt?.at ? formatDetailDate(timelinePickEvt.at) : "—"}</p>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                          <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase">W pakowaniu</span>
                          <p className="font-bold text-slate-900 mt-2">{(timelinePackEvt?.user_label ?? timelinePackEvt?.title ?? "").trim() || "—"}</p>
                          <p className="text-xs text-slate-500">{timelinePackEvt?.at ? formatDetailDate(timelinePackEvt.at) : "—"}</p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 mt-4">Koszyk / wózek: <span className="font-bold text-slate-900">{(wmsFulfillment?.basket_code ?? wmsFulfillment?.wms_vehicle_label ?? "").trim() || "—"}</span></p>
                    </SummaryDashboardCard>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <SummaryDashboardCard title="Safe Order">
                      <div className="flex items-center gap-4 text-sm text-slate-800">
                        <Shield size={32} className="text-blue-500"/>
                        <div><p className="font-bold">Brak sygnałów ryzyka</p><p className="text-slate-500 text-xs">Zamówienie nie ma aktywnych oznaczeń fraud.</p></div>
                      </div>
                    </SummaryDashboardCard>
                    <SummaryDashboardCard title="Dodatkowe pola">
                      <OrderAdditionalFieldsSection orderId={order.id} documents={order.order_documents ?? []} onOrderRefresh={() => void reloadOrderById(order.id)} />
                    </SummaryDashboardCard>
                  </div>

                  <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Logi czynności</h3>
                      <input type="text" value={summaryLogSearch} onChange={(e) => setSummaryLogSearch(e.target.value)} placeholder="Szukaj..." className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-slate-50 outline-none w-64"/>
                    </div>
                    <table className="w-full text-left text-sm border-t border-slate-100">
                      <thead className="text-[10px] uppercase font-bold text-slate-400"><tr><th className="py-2">Czas</th><th className="py-2">Zdarzenie</th><th className="py-2">Komunikat</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {summaryPanelLogs.map((row) => (
                          <tr key={String(row.id)} className={row.severity === "error" ? "bg-red-50 text-red-900" : row.severity === "warn" ? "bg-amber-50 text-amber-900" : ""}>
                            <td className="py-2 text-slate-500 font-mono text-xs w-48">{row.at}</td>
                            <td className="py-2 font-bold text-xs uppercase text-slate-600">{row.kind}</td>
                            <td className="py-2">{row.msg}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>

                <aside className="w-full lg:w-[360px] shrink-0 space-y-6">
                  <SummaryDashboardCard title="Kupujący" right={<button onClick={() => setEditBuyerModalOpen(true)} className="text-slate-400 hover:text-slate-800"><Pencil className="h-4 w-4" strokeWidth={2}/></button>}>
                    <div className="text-sm space-y-2">
                      <p className="font-bold text-lg text-slate-900">{contact.name}</p>
                      {order.customer && <Link to={`/customers/${order.customer.id}`} className="text-blue-700 font-medium hover:underline">{order.customer.display_name}</Link>}
                      <p className="text-slate-600 flex items-center pt-2"><Phone size={14} className="mr-2 text-slate-400"/> {contact.phone}</p>
                      <p className="text-slate-600 flex items-center"><Mail size={14} className="mr-2 text-slate-400"/> <span className="break-all">{contact.email}</span></p>
                    </div>
                  </SummaryDashboardCard>

                  <SummaryDashboardCard title="Podsumowanie zamówienia">
                    {((wmsFulfillment?.customer_comment ?? order.latest_customer_comment_preview ?? "").trim()) ? (
                      <div className="bg-[#fff9c4] border border-[#f5e08b] text-yellow-900 p-4 rounded-lg text-sm mb-4"><strong>Uwaga:</strong> {(wmsFulfillment?.customer_comment ?? order.latest_customer_comment_preview ?? "").trim()}</div>
                    ) : null}
                    <div className="space-y-4 text-sm text-slate-600">
                      <div className="flex justify-between items-center"><span>Źródło</span><span className="font-bold text-slate-900">{(order.source ?? "").trim() || "—"}</span></div>
                      <div className="flex justify-between items-center"><span>Wartość produktów</span><span className="font-medium text-slate-800">{linesTotalDisplay}</span></div>
                      <div className="flex justify-between items-center"><span>Koszt dostawy</span><span className="font-medium text-slate-800 flex items-center">{order.panel_shipping_cost != null ? formatMoney(Number(order.panel_shipping_cost), order.currency) : (order.panel_shipping_cost_display ?? "—")}</span></div>
                      <div className="border-t border-slate-200 pt-4 mt-4 flex justify-between items-end">
                        <span className="font-medium text-slate-700">Razem</span>
                        <div className="text-right">
                          <span className="font-black text-2xl text-slate-900 block">{formatMoney(order.value, order.currency)}</span>
                          {paymentStatusIsPaid(order.panel_payment_status) && <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded mt-1 inline-block">Opłacone</span>}
                        </div>
                      </div>
                    </div>
                  </SummaryDashboardCard>

                  <SummaryDashboardCard title="Rabat i marża">
                    <div className="flex space-x-2 mb-4">
                      <div className="flex bg-slate-100 rounded-md p-1">
                        <button className={`px-3 py-1 rounded text-xs font-bold ${orderRabatMode === "pln" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`} onClick={() => setOrderRabatMode("pln")}>PLN</button>
                        <button className={`px-3 py-1 rounded text-xs font-bold ${orderRabatMode === "pct" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`} onClick={() => setOrderRabatMode("pct")}>%</button>
                      </div>
                      <input className={inpSm} value={orderRabatDraft} onChange={e => setOrderRabatDraft(e.target.value)} placeholder="Rabat"/>
                      <button disabled={orderRabatSaving} onClick={() => void saveOrderDiscount()} className="bg-slate-900 text-white px-4 py-1.5 rounded-md text-sm font-bold ml-1 hover:bg-slate-800">{orderRabatSaving ? "..." : "Zapisz"}</button>
                    </div>
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex justify-between"><span>Po rabacie</span><span className="font-medium text-slate-900">{formatMoney(productsAfterDiscount, order.currency)}</span></div>
                      <div className="flex justify-between"><span>Marża %</span><span className={`font-bold ${marginTone}`}>{order.margin != null && Number.isFinite(Number(order.margin)) ? `${Number(order.margin).toFixed(2)}%` : "—"}</span></div>
                    </div>
                  </SummaryDashboardCard>
                </aside>
              </div>
            ) : null}

            {activeTab === "products" ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                <main className="min-w-0 space-y-6">
                  {wmsErr && <p className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-md text-sm font-medium">{wmsErr}</p>}
                  {warehouseId != null && <OrderMissingProductsSection tenantId={DAMAGE_TENANT_ID} orderId={order.id} lines={wmsFulfillment?.lines ?? []} itemWaitingById={itemWaitingById} onRefreshOrder={() => void reloadOrderById(order.id)} onRefreshWms={() => void loadWmsFulfillment()} sectionDomId="wms-braki-sekcja" />}
                  
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex gap-4 items-center">
                      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Produkty</h2>
                      <label className="text-sm text-slate-600 flex items-center font-medium"><input type="checkbox" className="mr-2" checked={showZeroQtyHistoryRows} onChange={e => setShowZeroQtyHistoryRows(e.target.checked)}/> Pokaż usunięte</label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setAddProductOpen(true)} className="border border-slate-300 rounded px-4 py-2 text-sm font-bold shadow-sm">Dodaj produkt</button>
                      <button onClick={() => setAddBundleOpen(true)} className="border border-slate-300 rounded px-4 py-2 text-sm font-bold shadow-sm">Dodaj zestaw</button>
                      <Link to={WMS_ROUTES.packingOrder(order.id)} className="bg-blue-600 text-white rounded px-6 py-2 text-sm font-bold shadow-sm">Spakuj</Link>
                    </div>
                  </div>

                  <div className="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
                    <OrderWarehouseProductsSection lines={summaryProductsLines} orderItems={order.items} wmsByItemId={wmsByItemId} wmsFulfillment={wmsFulfillment} wmsLoading={wmsLoading} currency={order.currency} productEditTenantId={order.tenant_id ?? DAMAGE_TENANT_ID} orderId={order.id} linesTotalDisplay={linesTotalDisplay} itemWaitingById={itemWaitingById} onRefreshOrder={() => void reloadOrderById(order.id)} onRefreshWms={() => void loadWmsFulfillment()} onReplaceProduct={(oid) => { setTableReplaceItemId(oid); setTableReplaceOpen(true); }} onLineAction={handleOrderLineMenuAction} formatMoney={formatMoney} hideLineTotalHeader panelFulfillmentHistory={panelFulfillmentHistory} formatDetailDate={formatDetailDate} showProductLineHistory={showZeroQtyHistoryRows} />
                  </div>
                  
                  <div className="bg-white rounded-md border border-slate-200 shadow-sm p-5">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">DOPASOWANE OPAKOWANIA</h3>
                    <OrderMatchedPackagingSection card={wmsFulfillment} />
                  </div>
                </main>
                <aside className="space-y-6">
                  <WmsOperationTimesKpiPanel cells={wmsSidebarTimeCells} />
                  <div className="bg-white rounded-md border border-slate-200 shadow-sm p-5">
                     <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">HISTORIA WMS</h3>
                     <OrderHistoryTimeline compact events={orderHistoryTimelineEvents} formatDate={formatDetailDate} />
                  </div>
                </aside>
              </div>
            ) : null}

            {activeTab === "comms" ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                <main className="space-y-6">
                  <section className="bg-white rounded-md shadow-sm border border-slate-200 p-6">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">Notatki operacyjne</h3>
                    <textarea value={opDraft} onChange={(e) => setOpDraft(e.target.value)} rows={3} placeholder="Wpisz treść..." className="w-full bg-slate-50 border border-slate-200 rounded-md p-3 text-sm focus:bg-white outline-none focus:border-blue-400 mb-4"/>
                    <div className="flex justify-between items-center">
                      <div className="flex gap-4 text-sm font-medium text-slate-600">
                        <label><input type="checkbox" className="mr-2" checked={opVisPick} onChange={e => setOpVisPick(e.target.checked)}/> Zbieranie</label>
                        <label><input type="checkbox" className="mr-2" checked={opVisPack} onChange={e => setOpVisPack(e.target.checked)}/> Pakowanie</label>
                      </div>
                      <button disabled={opSaving || !opDraft.trim()} onClick={() => void saveOperationalNote()} className="bg-slate-900 text-white font-bold text-sm px-6 py-2 rounded-md hover:bg-slate-800">Zapisz</button>
                    </div>
                  </section>
                  <section className="bg-white rounded-md shadow-sm border border-slate-200 p-6">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">Wiadomość do klienta</h3>
                    <textarea id="order-comms-note" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={4} placeholder="Wpisz treść..." className="w-full bg-slate-50 border border-slate-200 rounded-md p-3 text-sm focus:bg-white outline-none focus:border-blue-400 mb-4"/>
                    <div className="flex justify-end">
                      <button className="bg-orange-500 text-white font-bold text-sm px-8 py-2 rounded-md hover:bg-orange-600">Wyślij</button>
                    </div>
                  </section>
                </main>
                <aside className="space-y-6">
                  <SummaryDashboardCard title="Klient">
                    <div className="text-sm space-y-2">
                      <p className="font-bold text-lg text-slate-900">{contact.name}</p>
                      <p className="text-slate-600 flex items-center pt-2"><Phone size={14} className="mr-2 text-slate-400"/> {contact.phone}</p>
                      <p className="text-slate-600 flex items-center"><Mail size={14} className="mr-2 text-slate-400"/> <span className="break-all">{contact.email}</span></p>
                    </div>
                  </SummaryDashboardCard>
                </aside>
              </div>
            ) : null}

            {activeTab === "docs" ? (
              <div className="space-y-6 max-w-[1200px]">
                <OrderDocFilesTableSection title={`Dokumenty sprzedaży (${docsTabDocumentsRows.length})`} rows={docsTabDocumentsRows} showTypeColumn onUploadFiles={(files) => handleOrderDocUpload("docs", files)} onPreview={handleOrderDocPreview} onPrint={handleOrderDocPrint} onDownload={handleOrderDocDownload} onEmail={handleOrderDocEmail} onDelete={(row) => handleOrderDocDelete("docs", row)} />
                <OrderDocFilesTableSection title={`Załączniki (${docsTabFilesRows.length})`} rows={docsTabFilesRows} showTypeColumn onUploadFiles={(files) => handleOrderDocUpload("files", files)} onPreview={handleOrderDocPreview} onPrint={handleOrderDocPrint} onDownload={handleOrderDocDownload} onEmail={handleOrderDocEmail} onDelete={(row) => handleOrderDocDelete("files", row)} />
                <OrderDocFilesTableSection title={`Listy przewozowe (${docsTabWaybillsRows.length})`} rows={docsTabWaybillsRows} showTypeColumn onUploadFiles={(files) => handleOrderDocUpload("waybills", files)} onPreview={handleOrderDocPreview} onPrint={handleOrderDocPrint} onDownload={handleOrderDocDownload} onEmail={handleOrderDocEmail} onDelete={(row) => handleOrderDocDelete("waybills", row)} />
              </div>
            ) : null}

            {activeTab === "logs" ? (
              <div className="bg-white rounded-md border border-slate-200 p-6 shadow-sm max-w-[1200px]">
                 <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-6 border-b border-slate-100 pb-3">Dziennik zdarzeń</h3>
                 <input type="text" value={summaryLogSearch} onChange={(e) => setSummaryLogSearch(e.target.value)} placeholder="Filtruj logi..." className="border border-slate-300 rounded px-3 py-2 text-sm w-64 mb-6" />
                 <table className="w-full text-left text-sm">
                   <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100"><tr><th className="py-2 w-48">Czas</th><th className="py-2 w-48">Zdarzenie</th><th className="py-2">Komunikat</th></tr></thead>
                   <tbody className="divide-y divide-slate-50">
                     {summaryPanelLogs.map((row) => (
                       <tr key={String(row.id)} className={row.severity === "error" ? "bg-red-50 text-red-900" : row.severity === "warn" ? "bg-amber-50 text-amber-900" : ""}>
                         <td className="py-3 text-slate-500 font-mono text-xs">{row.at}</td>
                         <td className="py-3 font-bold text-[10px] uppercase">{row.kind}</td>
                         <td className="py-3">{row.msg}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* MODALS */}
      {orderDocPreviewModal != null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setOrderDocPreviewModal(null)}>
          <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold text-slate-900 mb-2">Podgląd</p>
            <p className="text-sm text-slate-600 mb-6 break-all">{orderDocPreviewModal}</p>
            <div className="flex justify-end"><button className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors" onClick={() => setOrderDocPreviewModal(null)}>Zamknij</button></div>
          </div>
        </div>
      )}

      {docTypeModalFile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => !docUploadBusy && setDocTypeModalFile(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold text-slate-900 mb-1">Typ dokumentu</p>
            <p className="text-sm text-slate-500 mb-6 truncate">{docTypeModalFile.name}</p>
            <label className="block text-sm font-bold text-slate-700 mb-2">Wybierz rodzaj wgrywanego pliku:</label>
            <select className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 mb-6" value={docTypeModalChoice} disabled={docUploadBusy} onChange={(e) => setDocTypeModalChoice(e.target.value as OrderDocModalType)}>
              {ORDER_DOCUMENT_MODAL_TYPES.map((t) => <option key={t} value={t}>{orderDocumentTypeToLabel(t).name}</option>)}
            </select>
            <div className="flex justify-end gap-3">
              <button className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={docUploadBusy} onClick={() => setDocTypeModalFile(null)}>Anuluj</button>
              <button className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50" disabled={docUploadBusy} onClick={handleConfirmDocTypeModal}>{docUploadBusy ? "Wgrywanie…" : "Wgraj plik"}</button>
            </div>
          </div>
        </div>
      )}

      <OrderAddProductModal open={addProductOpen} onClose={() => setAddProductOpen(false)} tenantId={DAMAGE_TENANT_ID} orderId={order.id} currency={(order.currency ?? "PLN").trim() || "PLN"} onAdded={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); dispatchWmsShortagesUpdated(); }}/>
      <OrderAddBundleModal open={addBundleOpen} onClose={() => setAddBundleOpen(false)} tenantId={order.tenant_id ?? DAMAGE_TENANT_ID} orderId={order.id} currency={(order.currency ?? "PLN").trim() || "PLN"} onAdded={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); dispatchWmsShortagesUpdated(); }}/>
      
      {tableReplaceOpen && tableReplaceItemId != null && tableReplaceContext && (
        <OrderReplaceProductModal open onClose={() => { setTableReplaceOpen(false); setTableReplaceItemId(null); }} orderId={order.id} tenantId={DAMAGE_TENANT_ID} orderItemId={tableReplaceItemId} sourceProductId={tableReplaceContext.sourceProductId} sourceProductName={tableReplaceContext.sourceProductName} missingQuantity={tableReplaceContext.missingQuantity} warehouseId={warehouseId} onReplaced={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); dispatchWmsShortagesUpdated(); setTableReplaceOpen(false); setTableReplaceItemId(null); }} />
      )}

      <OrderEditProductModal open={editProductItem != null} onClose={() => { setEditProductItem(null); setEditProductModalFocus("main"); }} orderId={order.id} item={editProductItem} focusSection={editProductModalFocus} currency={(order.currency ?? "PLN").trim() || "PLN"} onSaved={() => { void reloadOrderById(order.id); void loadWmsFulfillment(); }} />

      {summaryLineRemoveItemId != null && (
        <ConfirmModal title="Usunąć pozycję?" message={<>Czy na pewno usunąć pozycję z zamówienia?</>} confirmLabel="Usuń" pending={summaryLineRemovePending} onCancel={() => { if (!summaryLineRemovePending) setSummaryLineRemoveItemId(null); }} onConfirm={async () => { const id = summaryLineRemoveItemId; if (id == null) return; setSummaryLineRemovePending(true); try { await deleteOrderItemLine(order.id, id); await reloadOrderById(order.id); await loadWmsFulfillment(); dispatchWmsShortagesUpdated(); setSummaryLineRemoveItemId(null); } catch { window.alert("Błąd usunięcia."); } finally { setSummaryLineRemovePending(false); } }} />
      )}

      {warehouseId != null && (
        <NewComplaintWizard open={complaintWizardOpen} onClose={() => { setComplaintWizardOpen(false); setComplaintPrefillItemIds(undefined); }} warehouseId={warehouseId} initialOrderId={order?.id ?? null} initialOrderItemIds={complaintPrefillItemIds} onCreated={(cid) => navigate(`/orders/complaints/${cid}`)} />
      )}

      {order && (
        <EditBuyerModal open={editBuyerModalOpen} onClose={() => setEditBuyerModalOpen(false)} orderId={order.id} initialFirstName={(order.first_name ?? "").trim()} initialLastName={(order.last_name ?? "").trim()} initialPhone={contact.phone === "—" ? "" : contact.phone} initialEmail={contact.email === "—" ? "" : contact.email} canSave={warehouseId != null} onSaved={() => void reloadOrderById(order.id)} />
      )}
    </div>
  );
}