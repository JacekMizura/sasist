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
  /** VAT linii (%) z API — tylko prezentacja. */
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
  /** REPLACED — linia zarchiwizowana po zamianie; nie pokazujemy w głównej tabeli produktów. */
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
  /** Wewnętrzny kod skanowania WMS (ESP:O:id). */
  scan_code?: string | null;
  value?: number | null;
  discount_type?: "percent" | "amount" | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  total_products_value?: number | null;
  /** Przychód netto z linii dostawy (gdy brak w API — 0). */
  shipping_revenue_net?: number | null;
  /** Towar netto po rabacie + przychód netto z dostawy. */
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
  /** Wizualna flaga (flame): gray | blue | green | yellow | orange | red */
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

/** Format jak w tabeli dokumentów: DD.MM.RR, GG:MM */
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

/** Skrót identyfikatora zewnętrznego / skan (jak w nagłówku Sellasist). */
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

/** Klucz localStorage — lista zamówień może użyć tego samego wzorca (`order_office_pin:{id}`). */
function orderOfficePinStorageKey(orderId: number): string {
  return `order_office_pin:${orderId}`;
}

function formatExternalIdSnippet(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s.length > 28 ? `${s.slice(0, 14)}…${s.slice(-8)}` : s;
}

const ORDER_DETAIL_HEADER_ICON_BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/95 bg-white text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25 disabled:pointer-events-none disabled:opacity-30";

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
    <section className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-none sm:p-3.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-2.5 space-y-2 text-sm text-slate-800">{children}</div>
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
  /** Nadpisanie shell (np. większy padding w pierwszym rzędzie podsumowania). */
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={
        className ??
        "rounded-lg border border-slate-200/90 bg-white p-2.5 shadow-[0_1px_1px_rgba(15,23,42,0.04)] sm:p-3"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {right}
      </div>
      <div className={contentClassName ?? "mt-1.5"}>{children}</div>
    </section>
  );
}

const SUMMARY_TOP_CARD_SHELL =
  "rounded-lg border border-slate-200/90 bg-white p-2 shadow-[0_1px_1px_rgba(15,23,42,0.04)] sm:p-2.5";

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
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-0.5 text-sm last:border-b-0">
      <span className="shrink-0 pt-0.5 text-[11px] text-slate-500">{label}</span>
      <div className="flex min-w-0 items-start justify-end gap-1.5 text-right">
        <div className="min-w-0 font-medium leading-snug text-slate-900">{value}</div>
        {actions}
      </div>
    </div>
  );
}

type OrderDocTableKindTone = "fa" | "pa" | "rz" | "lp" | "na";

/** Wiersz dokumentu w tabelach zakładki „Dokumenty i pliki” (frontend + opcjonalny mock). */
type OrderDocTableRow = {
  id: string;
  name: string;
  /** Rodzaj rekordu (np. sprzedaż, plik, list przewozowy). */
  type: string;
  status: "approved" | "pending";
  date: string;
  fileUrl?: string;
  /** MIME z przeglądarki po uploadzie (podgląd). */
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

/** Jedna siatka: nagłówek + wiersze we wszystkich sekcjach zakładki Dokumenty i pliki. */
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
    <div className="flex w-full items-center justify-end gap-1.5">
      <button
        type="button"
        className="rounded p-1 text-gray-600 hover:bg-gray-100"
        title="Podgląd"
        aria-label="Podgląd"
        onClick={() => onPreview(row)}
      >
        <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="rounded p-1 text-gray-600 hover:bg-gray-100"
        title="Drukuj"
        aria-label="Drukuj"
        onClick={() => onPrint(row)}
      >
        <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="rounded p-1 text-gray-600 hover:bg-gray-100"
        title="Pobierz"
        aria-label="Pobierz"
        onClick={() => onDownload(row)}
      >
        <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="rounded p-1 text-gray-600 hover:bg-gray-100"
        title="E-mail"
        aria-label="E-mail"
        onClick={() => onEmail(row)}
      >
        <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="rounded p-1 text-gray-600 hover:bg-gray-100"
        title="Usuń"
        aria-label="Usuń"
        onClick={() => onDelete(row)}
      >
        <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
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
    <section className="space-y-2 rounded-lg border border-slate-200/90 bg-white p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <h3 className="text-xs font-semibold text-slate-900">{title}</h3>
      <input
        type="file"
        ref={uploadInputRef}
        className="hidden"
        onChange={(e) => {
          onUploadFiles?.(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-slate-900" aria-label="Zaznacz wszystkie" />
        <span className="text-sm text-slate-700">wykonaj</span>
        <button
          type="button"
          className="rounded p-1 text-gray-600 hover:bg-gray-100"
          title="Drukuj"
          aria-label="Drukuj"
          onClick={() => onToolbarPrint?.()}
        >
          <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          className="rounded p-1 text-gray-600 hover:bg-gray-100"
          title="Dodaj plik"
          aria-label="Dodaj plik z dysku"
          onClick={() => uploadInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          className="rounded p-1 text-gray-600 hover:bg-gray-100"
          title="E-mail"
          aria-label="E-mail"
          onClick={() => onToolbarEmail?.()}
        >
          <Mail className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[56rem] text-sm">
          <div
            className={`${DOCUMENTS_GRID} border-y border-gray-200 bg-gray-50 py-2 text-xs font-medium uppercase tracking-wide text-gray-500`}
            role="row"
          >
            <div className="flex justify-center" role="columnheader">
              <span className="sr-only">Wybór</span>
            </div>
            <div role="columnheader">Data</div>
            <div role="columnheader">Rodzaj</div>
            <div className="min-w-0" role="columnheader">
              Nazwa dokumentu
            </div>
            <div className="text-right" role="columnheader">
              <span className="sr-only">Akcje</span>
            </div>
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              className={`${DOCUMENTS_GRID} border-b border-slate-100 py-1.5 last:border-b-0`}
              role="row"
            >
              <div className="flex justify-center" role="cell">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-slate-900"
                  aria-label="Wybierz wiersz"
                />
              </div>
              <div className="whitespace-nowrap text-slate-500" role="cell">
                {row.date}
              </div>
              <div className="min-w-0" role="cell">
                {showTypeColumn && row.typeLabel ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded px-0.5 text-[9px] font-bold text-white ${orderDocKindToneClass(row.typeLabel.tone)}`}
                    >
                      {row.typeLabel.abbr}
                    </span>
                    <span className="truncate text-slate-800">{row.typeLabel.name}</span>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
              <div className="min-w-0 text-slate-900" role="cell">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 font-medium break-words">{row.name}</span>
                  <span
                    className={
                      row.status === "approved"
                        ? "shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-white"
                        : "shrink-0 rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600"
                    }
                  >
                    {row.status === "approved" ? "Zatwierdzony" : "Niezatwierdzony"}
                  </span>
                </div>
              </div>
              <div className="min-w-0 justify-self-end" role="cell">
                <OrderDocTableRowActions
                  row={row}
                  onPreview={onPreview}
                  onPrint={onPrint}
                  onDownload={onDownload}
                  onEmail={onEmail}
                  onDelete={onDelete}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type WmsSidebarTimeCell = { title: string; value: string; statusChip: string };

function WmsOperationTimesKpiPanel({ cells }: { cells: readonly WmsSidebarTimeCell[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Czasy operacji (WMS)</h3>
      <div className="mt-5 grid grid-cols-2 gap-4">
        {cells.map((cell) => (
          <div
            key={cell.title}
            className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm"
          >
            <p className="text-xs font-medium text-slate-500">{cell.title}</p>
            <p className="mt-3 text-3xl font-bold tabular-nums leading-none tracking-tight text-slate-900">{cell.value}</p>
            <p className="mt-3 text-xs font-semibold text-slate-600">{cell.statusChip}</p>
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

  const inpSm = "mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900";
  const expandAnim = (on: boolean) =>
    `overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${on ? "max-h-[720px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"}`;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center gap-2 text-slate-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
        Ładowanie…
      </div>
    );
  }
  if (err || !order) {
    return (
      <>
        <p className="text-sm text-red-600">{err || "Błąd"}</p>
        <Link to="/orders/list" className="mt-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline">
          ← Lista zamówień
        </Link>
      </>
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
          <span className="font-medium text-slate-600">#{order.number ?? order.id}</span>
        </nav>

          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
            {warehouseId != null ? (
              <>
                <button
                  type="button"
                  className="flex shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 lg:hidden"
                  onClick={() => setStatusDrawerOpen(true)}
                >
                  Statusy panelu
                </button>
                <div
                  className={`hidden min-h-0 min-w-0 shrink-0 flex-col gap-2 lg:sticky lg:top-3 lg:z-30 lg:flex lg:max-h-[calc(100dvh-5.75rem)] lg:overflow-y-auto lg:overscroll-y-contain lg:border-r lg:border-slate-200/90 lg:bg-slate-50/95 lg:pb-2 lg:pl-0 lg:pr-2.5 lg:pt-1 lg:shadow-[4px_0_24px_-12px_rgba(15,23,42,0.12)] ${isStatusPanelCollapsed ? "lg:w-14" : "lg:w-[260px]"}`}
                >
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
                        aria-label={isStatusPanelCollapsed ? "Rozwiń panel statusów" : "Zwiń panel statusów"}
                      >
                        <ChevronLeft className={`h-4 w-4 transition-transform ${isStatusPanelCollapsed ? "rotate-180" : ""}`} />
                      </button>
                    }
                  />
                </div>
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
                        warehouseId={warehouseId}
                        panelSummary={panelSummary}
                        panelSubgroups={panelSubgroups}
                        panelFilter={sidebarFilter}
                        onPanelFilterChange={(f) => {
                          navigate("/orders/list", { state: { panelFilter: f } });
                          setStatusDrawerOpen(false);
                        }}
                        chromeVariant="sellasist"
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
              <div className="min-w-0 space-y-2 border-b border-slate-100 pb-2 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 lg:flex-nowrap lg:gap-x-3">
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={prevOrderId == null}
                      onClick={() => {
                        if (prevOrderId == null) return;
                        navigate(`/orders/${prevOrderId}`, { state: location.state });
                      }}
                      className={`${ORDER_DETAIL_HEADER_ICON_BTN}`}
                      title="Poprzednie zamówienie"
                      aria-label="Poprzednie zamówienie"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={nextOrderId == null}
                      onClick={() => {
                        if (nextOrderId == null) return;
                        navigate(`/orders/${nextOrderId}`, { state: location.state });
                      }}
                      className={`${ORDER_DETAIL_HEADER_ICON_BTN}`}
                      title="Następne zamówienie"
                      aria-label="Następne zamówienie"
                    >
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                    </button>
                    <div className="mx-0.5 hidden h-6 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
                    <span
                      className="hidden h-7 min-w-[1.75rem] items-center justify-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-bold tabular-nums text-slate-500 sm:inline-flex"
                      title={ORDERS_PANEL_GROUP_LABELS[order.order_ui_status?.main_group ?? "NEW"]}
                    >
                      {ORDERS_PANEL_GROUP_LABELS[order.order_ui_status?.main_group ?? "NEW"].charAt(0)}
                    </span>
                    <OrderPriorityFlamePicker
                      orderId={order.id}
                      priorityColor={order.priority_color ?? null}
                      compactTrigger
                      onUpdated={(next) =>
                        setOrder((prev) => (prev ? { ...prev, priority_color: next } : prev))
                      }
                    />
                  </div>

                  <div className="min-w-0 flex-1 lg:min-w-[12rem]">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-slate-600">Zamówienie</span>
                      <button
                        type="button"
                        className="text-2xl font-semibold tracking-tight text-slate-900 underline decoration-dotted decoration-slate-400 underline-offset-2 hover:bg-slate-50"
                        title="Kopiuj numer"
                        onClick={() =>
                          void navigator.clipboard.writeText(String(order.number ?? order.id)).catch(() => {})
                        }
                      >
                        {order.number ?? order.id}
                      </button>
                      <span className="text-[11px] leading-none text-slate-400 tabular-nums">{dateLine}</span>
                      {order.customer ? (
                        <Link
                          to={`/customers/${order.customer.id}`}
                          className="max-w-[min(12rem,28vw)] truncate text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:underline"
                        >
                          {order.customer.display_name}
                        </Link>
                      ) : null}
                      {formatExternalIdSnippet(order.external_id) ? (
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 underline decoration-dotted decoration-slate-300 underline-offset-2 hover:text-slate-600"
                          title="Kopiuj ID zewnętrzne"
                          onClick={() =>
                            void navigator.clipboard
                              .writeText((order.external_id ?? "").trim())
                              .catch(() => {})
                          }
                        >
                          ID zew: {formatExternalIdSnippet(order.external_id)}
                        </button>
                      ) : null}
                      {(order.source ?? "").trim() ? (
                        <span className="hidden text-[11px] text-slate-400 md:inline">
                          {(order.source ?? "").trim()}
                        </span>
                      ) : null}
                    </div>
                    {order.order_origin === "COMPLAINT" ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded border border-amber-200/90 bg-amber-50/90 px-2 py-0.5 text-[11px] font-medium text-amber-950">
                          {order.complaint_order_type === "REPLACEMENT"
                            ? "Zamówienie z reklamacji (Nowy produkt)"
                            : order.complaint_order_type === "EXCHANGE"
                              ? "Zamówienie z reklamacji (Wymiana)"
                              : "Zamówienie z reklamacji"}
                        </span>
                        {order.complaint_id != null ? (
                          <Link
                            to={`/complaints/${order.complaint_id}`}
                            className="text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:underline"
                          >
                            Reklamacja #{order.complaint_id}
                          </Link>
                        ) : null}
                        {order.original_order_id != null ? (
                          <Link
                            to={`/orders/${order.original_order_id}`}
                            className="text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:underline"
                          >
                            Źródło #{order.original_order_id}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="ml-auto flex max-w-full shrink-0 flex-nowrap items-center gap-0.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:max-w-none">
                      <button
                        type="button"
                        onClick={() => {
                          if (!order?.id) return;
                          setOfficePin((p) => {
                            const next = !p;
                            try {
                              if (next) window.localStorage.setItem(orderOfficePinStorageKey(order.id), "1");
                              else window.localStorage.removeItem(orderOfficePinStorageKey(order.id));
                            } catch {
                              /* ignore */
                            }
                            return next;
                          });
                        }}
                        className={`${ORDER_DETAIL_HEADER_ICON_BTN} ${
                          officePin
                            ? "border-amber-400/90 bg-amber-50 text-amber-600 shadow-sm"
                            : "text-slate-400 hover:border-amber-200 hover:text-amber-600"
                        }`}
                        title={officePin ? "Oznaczono dla biura — kliknij, aby usunąć" : "Oznacz dla biura"}
                        aria-label={officePin ? "Usuń oznaczenie dla biura" : "Oznacz zamówienie dla biura"}
                        aria-pressed={officePin}
                      >
                        <Bookmark className={`h-4 w-4 shrink-0 ${officePin ? "fill-current" : ""}`} strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={`${ORDER_DETAIL_HEADER_ICON_BTN} ${
                          order?.has_internal_note
                            ? "border-red-300/90 bg-red-50 text-red-700 shadow-sm"
                            : "text-slate-400 hover:border-red-200 hover:text-red-700"
                        }`}
                        title="Notatki operacyjne magazynu"
                        aria-label="Notatki operacyjne magazynu"
                        onClick={() => {
                          setActiveTab("summary");
                          window.setTimeout(() => {
                            document.getElementById("order-summary-operational-notes")?.scrollIntoView({
                              behavior: "smooth",
                              block: "nearest",
                            });
                          }, 0);
                        }}
                      >
                        <Pin className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      </button>
                      {warehouseId != null ? (
                        <div className="relative" ref={returnsComplaintsRef}>
                          <button
                            type="button"
                            title="Zwroty i reklamacje"
                            aria-label="Zwroty i reklamacje"
                            aria-expanded={returnsComplaintsOpen}
                            aria-haspopup="menu"
                            onClick={() => setReturnsComplaintsOpen((v) => !v)}
                            className={ORDER_DETAIL_HEADER_ICON_BTN}
                          >
                            <MessageSquareWarning className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                          </button>
                          {returnsComplaintsOpen ? (
                            <div
                              role="menu"
                              className="absolute right-0 z-[85] mt-1 min-w-[14rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                                onClick={() => {
                                  setComplaintPrefillItemIds(undefined);
                                  setComplaintWizardOpen(true);
                                  setReturnsComplaintsOpen(false);
                                }}
                              >
                                Utwórz reklamację
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                                onClick={() => {
                                  navigate(WMS_ROUTES.returns, {
                                    state: { preselectOrderId: order.id, openReturnCreateForm: true },
                                  });
                                  setReturnsComplaintsOpen(false);
                                }}
                              >
                                Utwórz zwrot
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={`${ORDER_DETAIL_HEADER_ICON_BTN} ${
                          order?.has_customer_comment
                            ? "border-emerald-300/90 bg-emerald-50 text-emerald-700 shadow-sm"
                            : ""
                        }`}
                        title="Wyślij wiadomość"
                        aria-label="Wyślij wiadomość"
                        onClick={() => {
                          setActiveTab("comms");
                          window.setTimeout(() => {
                            document.getElementById("order-comms-note")?.focus();
                          }, 0);
                        }}
                      >
                        <Mail className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={ORDER_DETAIL_HEADER_ICON_BTN}
                        title="Korespondencja"
                        aria-label="Korespondencja"
                        onClick={() => setActiveTab("comms")}
                      >
                        <Inbox className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={ORDER_DETAIL_HEADER_ICON_BTN}
                        title="Dokumenty i pliki"
                        aria-label="Dokumenty i pliki"
                        onClick={() => setActiveTab("docs")}
                      >
                        <Files className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={`${ORDER_DETAIL_HEADER_ICON_BTN} cursor-not-allowed opacity-40`}
                        title="Dodaj produkty z innego zamówienia (wkrótce)"
                        aria-label="Dodaj produkty z innego zamówienia"
                        disabled
                      >
                        <Link2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={ORDER_DETAIL_HEADER_ICON_BTN}
                        title="Kopiuj nagłówek zamówienia"
                        aria-label="Kopiuj nagłówek zamówienia"
                        onClick={() => {
                          const text = `Zamówienie ${order.number ?? order.id}\n${dateLine}`;
                          void navigator.clipboard.writeText(text).catch(() => {});
                        }}
                      >
                        <Copy className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={ORDER_DETAIL_HEADER_ICON_BTN}
                        title="Drukuj"
                        aria-label="Drukuj"
                        onClick={() => window.print()}
                      >
                        <Printer className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      </button>
                      <Link
                        to={WMS_ROUTES.packingOrder(order.id)}
                        className="inline-flex shrink-0 items-center rounded-md border border-blue-700 bg-blue-700 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:border-blue-800 hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35"
                        title="Spakuj (WMS)"
                      >
                        Spakuj
                      </Link>
                      <Link
                        to="/settings/orders/ui-statuses"
                        className={ORDER_DETAIL_HEADER_ICON_BTN}
                        title="Ustawienia statusów panelu"
                        aria-label="Ustawienia statusów panelu"
                      >
                        <Settings className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      </Link>
                    </div>
                  </div>

                  <div className="flex w-full flex-wrap items-start gap-2 border-t border-slate-100/90 pt-2 lg:flex-nowrap lg:items-center">
                    <div className="min-w-0 flex-1 basis-full sm:max-w-xl lg:max-w-md">
                      {warehouseId != null ? (
                        <OrderDetailPrimaryStatusDropdown
                          variant="compact"
                          currentStatus={order.order_ui_status ?? null}
                          panelSummary={panelSummary}
                          panelSubgroups={panelSubgroups}
                          saving={panelSaving}
                          onSelectStatus={async (subStatusId) => {
                            setPanelSaving(true);
                            try {
                              const updated = await patchOrderUiStatus(order.id, DAMAGE_TENANT_ID, warehouseId, subStatusId);
                              setOrder((prev) =>
                                prev ? { ...prev, order_ui_status: updated.order_ui_status ?? null } : prev,
                              );
                              await loadPanelSummary();
                            } finally {
                              setPanelSaving(false);
                            }
                          }}
                        />
                      ) : panelOrderStatusBrief ? (
                        <OrderUiStatusConfigRowPresent status={panelOrderStatusBrief} variant="compact" />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 lg:justify-end">
                      <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-slate-200/90 bg-slate-50/90 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        WMS
                      </span>
                      {wmsDualWorkflow ? (
                        <>
                          {(() => {
                            const { total, pickedSum, packed } = wmsDualWorkflow;
                            const fmt = (n: number) =>
                              Math.abs(n - Math.round(n)) < 1e-5 ? String(Math.round(n)) : String(n);
                            const pickFull = total > 1e-9 && pickedSum + 1e-6 >= total;
                            const packFull = total > 1e-9 && packed + 1e-6 >= total;
                            const pickCls = pickFull
                              ? "inline-flex h-6 shrink-0 items-center rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2 text-[10px] font-medium text-emerald-900"
                              : pickedSum > 1e-6
                                ? "inline-flex h-6 shrink-0 items-center rounded-full border border-sky-200/80 bg-sky-50/90 px-2 text-[10px] font-medium text-sky-900"
                                : "inline-flex h-6 shrink-0 items-center rounded-full border border-slate-200/90 bg-white px-2 text-[10px] font-medium text-slate-600";
                            const packCls = packFull
                              ? "inline-flex h-6 shrink-0 items-center rounded-full border border-teal-200/80 bg-teal-50/90 px-2 text-[10px] font-medium text-teal-900"
                              : packed > 1e-6
                                ? "inline-flex h-6 shrink-0 items-center rounded-full border border-violet-200/80 bg-violet-50/90 px-2 text-[10px] font-medium text-violet-900"
                                : "inline-flex h-6 shrink-0 items-center rounded-full border border-slate-200/90 bg-white px-2 text-[10px] font-medium text-slate-600";
                            return (
                              <>
                                <span className={pickCls}>Zbieranie {fmt(pickedSum)}/{fmt(total)}</span>
                                <span className={packCls}>Pakowanie {fmt(packed)}/{fmt(total)}</span>
                              </>
                            );
                          })()}
                          {wmsDualWorkflow.vehicle ? (
                            <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[10px] font-medium text-slate-600">
                              {wmsDualWorkflow.vehicle}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400">Brak postępu</span>
                      )}
                      {showWmsOperationalHeaderBadge ? (
                        <OrderWmsOperationalBadge
                          workflowPhase={wmsWorkflowPhaseForBadge}
                          packedAtIso={order.wms_packed_at}
                          packedByLabel={order.wms_packed_by_label}
                          className="!h-6 !rounded-full !border-slate-200/90 !px-2 !py-0 !text-[10px]"
                        />
                      ) : null}
                    </div>
                  </div>
              </div>

              <div className="sticky top-0 z-10 w-full min-h-[2rem] border-b border-slate-200 bg-white/95 pb-0 pt-1 backdrop-blur-sm">
                <div
                  className="flex min-w-0 gap-4 overflow-x-auto md:gap-6"
                  role="tablist"
                  aria-label="Sekcje zamówienia"
                >
                  {DETAIL_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={`shrink-0 pb-2 text-xs font-medium transition-colors -mb-px border-b-2 md:text-sm ${
                        activeTab === t.id
                          ? "border-orange-500 text-slate-900"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-3">
          {activeTab === "summary" ? (
            <div className="min-w-0">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <SummaryDashboardCard
                className={SUMMARY_TOP_CARD_SHELL}
                contentClassName="mt-3"
                title="Dostawa i płatność"
                right={
                  <span className="flex items-center gap-0.5">
                    <button
                      type="button"
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      title="Odśwież dane"
                      aria-label="Odśwież dane"
                      onClick={() => {
                        void reloadOrderById(order.id);
                        void loadWmsFulfillment();
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                    <Link
                      to={WMS_ROUTES.packingOrder(order.id)}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      title="Operacje przesyłki (WMS)"
                      aria-label="Operacje przesyłki"
                    >
                      <Truck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </Link>
                  </span>
                }
              >
                <SummaryCompactRow
                  label="Metoda płatności"
                  value={
                    <select
                      className="mt-0.5 w-full max-w-[14rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900"
                      value={payMethodDraft}
                      onChange={(e) => setPayMethodDraft(e.target.value)}
                    >
                      <option value="">—</option>
                      {Array.from(
                        new Set([...PAYMENT_METHOD_PRESETS, payMethodDraft].filter((x) => (x || "").trim().length > 0)),
                      ).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  }
                />
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 py-1.5 text-[11px] last:border-b-0">
                  <span className="shrink-0 pt-0.5 text-slate-500">Status płatności</span>
                  <select
                    className="max-w-[14rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900"
                    value={payStatusDraft}
                    onChange={(e) => setPayStatusDraft(e.target.value)}
                  >
                    <option value="">—</option>
                    {Array.from(
                      new Set([...PAYMENT_STATUS_PRESETS, payStatusDraft].filter((x) => (x || "").trim().length > 0)),
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex flex-col gap-0.5 border-b border-slate-100 py-1.5 text-[11px] text-slate-500 last:border-b-0">
                  <span className="flex min-w-0 items-center gap-2">
                    {order.shipping_method_logo_url ? (
                      <img
                        src={order.shipping_method_logo_url}
                        alt=""
                        className="h-8 w-8 shrink-0 object-contain"
                        loading="lazy"
                      />
                    ) : null}
                    <span className="flex min-w-0 items-center gap-1">
                      <Truck className="h-3 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                      Sposób wysyłki
                    </span>
                  </span>
                  <select
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900"
                    value={shipDraft}
                    disabled={warehouseId == null}
                    onChange={(e) => setShipDraft(e.target.value)}
                  >
                    <option value="">— brak —</option>
                    {(() => {
                      const oid = order.shipping_method_id?.trim();
                      if (!oid || shippingMethods.some((m) => m.id === oid)) return null;
                      return (
                        <option value={oid}>
                          {order.shipping_method ?? "Metoda"} (powiązanie)
                        </option>
                      );
                    })()}
                    {shippingMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {!m.is_active ? " (nieaktywna)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {warehouseId != null ? (
                  <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-800 hover:bg-slate-50"
                      onClick={() => {
                        setShipDraft(order.shipping_method_id?.trim() ?? "");
                        setPayMethodDraft((order.panel_payment_method ?? "").trim());
                        setPayStatusDraft((order.panel_payment_status ?? "").trim());
                      }}
                    >
                      Anuluj
                    </button>
                    <button
                      type="button"
                      disabled={shipPaySaving}
                      onClick={() => {
                        setShipPaySaving(true);
                        void patchOrder(order.id, {
                          shipping_method_id: shipDraft.trim() || null,
                          payment_method: payMethodDraft.trim() || null,
                          payment_status: payStatusDraft.trim() || null,
                        })
                          .then(() => reloadOrderById(order.id))
                          .finally(() => setShipPaySaving(false));
                      }}
                      className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-0.5 text-[10px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {shipPaySaving ? "…" : "Zapisz"}
                    </button>
                  </div>
                ) : null}
              </SummaryDashboardCard>

              <SummaryDashboardCard
                className={SUMMARY_TOP_CARD_SHELL}
                contentClassName="mt-3"
                title="Adres dostawy"
                right={
                  warehouseId != null && !addressEditing ? (
                    <button
                      type="button"
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      aria-label="Edytuj adres dostawy"
                      onClick={() => {
                        setAddrDraft(shippingFromOrderJson(order.addresses_json));
                        setAddressEditing(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                  ) : null
                }
              >
                {addressEditing ? (
                  <div className="space-y-2 text-[11px]">
                    <label className="flex flex-col gap-0.5 text-slate-600">
                      Imię i nazwisko / nazwa odbiorcy
                      <input
                        className={inpSm}
                        value={addrDraft.name}
                        onChange={(e) => setAddrDraft((d) => ({ ...d, name: e.target.value }))}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-slate-600">
                      Ulica i numer
                      <input
                        className={inpSm}
                        value={addrDraft.street}
                        onChange={(e) => setAddrDraft((d) => ({ ...d, street: e.target.value }))}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5 text-slate-600">
                        Kod pocztowy
                        <input
                          className={inpSm}
                          value={addrDraft.postal}
                          onChange={(e) => setAddrDraft((d) => ({ ...d, postal: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-slate-600">
                        Miasto
                        <input
                          className={inpSm}
                          value={addrDraft.city}
                          onChange={(e) => setAddrDraft((d) => ({ ...d, city: e.target.value }))}
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-0.5 text-slate-600">
                      Kraj
                      <input
                        className={inpSm}
                        value={addrDraft.country}
                        onChange={(e) => setAddrDraft((d) => ({ ...d, country: e.target.value }))}
                      />
                    </label>
                    <div className="flex flex-wrap justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                        disabled={addressSaving}
                        onClick={() => {
                          setAddrDraft(shippingFromOrderJson(order.addresses_json));
                          setAddressEditing(false);
                        }}
                      >
                        Anuluj
                      </button>
                      <button
                        type="button"
                        disabled={addressSaving || warehouseId == null}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        onClick={() => {
                          setAddressSaving(true);
                          void patchOrder(order.id, {
                            shipping_name: addrDraft.name.trim() || null,
                            shipping_street: addrDraft.street.trim() || null,
                            shipping_city: addrDraft.city.trim() || null,
                            shipping_postal_code: addrDraft.postal.trim() || null,
                            shipping_country: addrDraft.country.trim() || null,
                          })
                            .then(() => reloadOrderById(order.id))
                            .finally(() => {
                              setAddressSaving(false);
                              setAddressEditing(false);
                            });
                        }}
                      >
                        {addressSaving ? "…" : "Zapisz"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 text-[11px] leading-snug text-slate-800">
                    <p className="font-semibold text-slate-900">{summaryShippingName}</p>
                    {shippingExtras?.company ? (
                      <p className="text-slate-700">
                        <span className="text-slate-500">Firma: </span>
                        {shippingExtras.company}
                      </p>
                    ) : null}
                    <p className="tabular-nums text-slate-700">
                      <span className="text-slate-500">Tel.: </span>
                      {shippingExtras?.phone || (contact.phone !== "—" ? contact.phone : "—")}
                    </p>
                    <p className="break-all text-slate-700">
                      <span className="text-slate-500">E-mail: </span>
                      {shippingExtras?.email || (contact.email !== "—" ? contact.email : "—")}
                    </p>
                    {contact.addressLines.length > 0 && contact.addressLines[0] !== "—" ? (
                      contact.addressLines.map((ln, i) => (
                        <p key={`ship-${i}`} className="text-slate-700">
                          {ln}
                        </p>
                      ))
                    ) : (
                      <p className="text-slate-500">Brak adresu w danych zamówienia.</p>
                    )}
                    {shippingExtras?.pickupPoint ? (
                      <p className="text-slate-700">
                        <span className="text-slate-500">Punkt odbioru: </span>
                        {shippingExtras.pickupPoint}
                      </p>
                    ) : null}
                    {shippingExtras?.pickupCode ? (
                      <p className="tabular-nums text-slate-700">
                        <span className="text-slate-500">Kod odbioru: </span>
                        {shippingExtras.pickupCode}
                      </p>
                    ) : null}
                  </div>
                )}
              </SummaryDashboardCard>

              <SummaryDashboardCard
                className={SUMMARY_TOP_CARD_SHELL}
                contentClassName="mt-3"
                title={
                  summaryDocEditing
                    ? docDraft.document_type === "INVOICE"
                      ? "Faktura"
                      : "Paragon"
                    : (order.panel_document_type ?? "").trim().toUpperCase() === "INVOICE"
                      ? "Faktura"
                      : (order.panel_document_type ?? "").trim().toUpperCase() === "PARAGON"
                        ? "Paragon"
                        : "Dokument sprzedaży"
                }
                right={
                  <span className="flex items-center gap-0.5">
                    {warehouseId != null && !summaryDocEditing ? (
                      <button
                        type="button"
                        className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label="Edytuj dokument"
                        onClick={() => {
                          const inv = parseBillingInvoice(order.addresses_json);
                          const t = (order.panel_document_type ?? "").trim().toUpperCase();
                          setDocDraft({
                            document_type: t === "INVOICE" ? "INVOICE" : "PARAGON",
                            sales_document_number: (order.sales_document_number ?? "").trim(),
                            company_name: inv.companyName,
                            nip: inv.nip,
                            billing_email: inv.email,
                          });
                          setSummaryDocEditing(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      title="Drukuj"
                      aria-label="Drukuj"
                      onClick={() => window.print()}
                    >
                      <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </button>
                  </span>
                }
              >
                {summaryDocEditing ? (
                  <div className="space-y-2 text-[11px]">
                    <label className="flex flex-col gap-0.5 text-slate-600">
                      Rodzaj dokumentu
                      <select
                        className={inpSm}
                        value={docDraft.document_type}
                        onChange={(e) =>
                          setDocDraft((d) => ({
                            ...d,
                            document_type: e.target.value === "INVOICE" ? "INVOICE" : "PARAGON",
                          }))
                        }
                      >
                        <option value="PARAGON">Paragon</option>
                        <option value="INVOICE">Faktura</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5 text-slate-600">
                      Numer dokumentu
                      <input
                        className={`${inpSm} font-mono`}
                        value={docDraft.sales_document_number}
                        onChange={(e) => setDocDraft((d) => ({ ...d, sales_document_number: e.target.value }))}
                      />
                    </label>
                    {docDraft.document_type === "INVOICE" ? (
                      <>
                        <label className="flex flex-col gap-0.5 text-slate-600">
                          Firma
                          <input
                            className={inpSm}
                            value={docDraft.company_name}
                            onChange={(e) => setDocDraft((d) => ({ ...d, company_name: e.target.value }))}
                          />
                        </label>
                        <label className="flex flex-col gap-0.5 text-slate-600">
                          NIP
                          <input
                            className={inpSm}
                            value={docDraft.nip}
                            onChange={(e) => setDocDraft((d) => ({ ...d, nip: e.target.value }))}
                          />
                        </label>
                        <label className="flex flex-col gap-0.5 text-slate-600">
                          E-mail do faktury
                          <input
                            type="email"
                            className={inpSm}
                            value={docDraft.billing_email}
                            onChange={(e) => setDocDraft((d) => ({ ...d, billing_email: e.target.value }))}
                          />
                        </label>
                        {billingInvoice?.streetLine || billingInvoice?.cityLine ? (
                          <p className="text-[10px] leading-snug text-slate-500">
                            Adres rozliczeniowy z importu:{" "}
                            {[billingInvoice.streetLine, billingInvoice.cityLine].filter(Boolean).join(", ") || "—"}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        Paragon — uproszczone dane nabywcy; numer zapiszesz powyżej.
                      </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                        disabled={docSaving}
                        onClick={() => {
                          const inv = parseBillingInvoice(order.addresses_json);
                          const t = (order.panel_document_type ?? "").trim().toUpperCase();
                          setDocDraft({
                            document_type: t === "INVOICE" ? "INVOICE" : "PARAGON",
                            sales_document_number: (order.sales_document_number ?? "").trim(),
                            company_name: inv.companyName,
                            nip: inv.nip,
                            billing_email: inv.email,
                          });
                          setSummaryDocEditing(false);
                        }}
                      >
                        Anuluj
                      </button>
                      <button
                        type="button"
                        disabled={docSaving || warehouseId == null}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        onClick={() => {
                          setDocSaving(true);
                          const isInv = docDraft.document_type === "INVOICE";
                          void patchOrder(order.id, {
                            document_type: docDraft.document_type,
                            sales_document_number: docDraft.sales_document_number.trim() || null,
                            company_name: isInv ? docDraft.company_name.trim() || null : null,
                            nip: isInv ? docDraft.nip.trim() || null : null,
                            email: isInv ? docDraft.billing_email.trim() || null : null,
                          })
                            .then(() => reloadOrderById(order.id))
                            .finally(() => {
                              setDocSaving(false);
                              setSummaryDocEditing(false);
                            });
                        }}
                      >
                        {docSaving ? "…" : "Zapisz"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <SummaryCompactRow label="Rodzaj" value={panelDocumentLabel} />
                    <SummaryCompactRow
                      label="Numer"
                      value={
                        <span className="font-mono text-[11px] text-slate-700">
                          {(order.sales_document_number ?? "").trim() || "—"}
                        </span>
                      }
                    />
                    {(order.panel_document_type ?? "").trim().toUpperCase() === "INVOICE" &&
                    billingInvoice &&
                    (billingInvoice.companyName || billingInvoice.nip || billingInvoice.email) ? (
                      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-700">
                        {billingInvoice.companyName ? <p className="font-medium text-slate-900">{billingInvoice.companyName}</p> : null}
                        {billingInvoice.nip ? <p className="tabular-nums">NIP {billingInvoice.nip}</p> : null}
                        {billingInvoice.email ? <p className="break-all text-slate-700">{billingInvoice.email}</p> : null}
                        {billingInvoice.streetLine ? <p>{billingInvoice.streetLine}</p> : null}
                        {billingInvoice.cityLine ? <p>{billingInvoice.cityLine}</p> : null}
                      </div>
                    ) : null}
                    {(order.panel_document_type ?? "").trim().toUpperCase() === "PARAGON" ? (
                      <p className="mt-2 text-[11px] text-slate-500">Dane uproszczone (paragon).</p>
                    ) : null}
                  </>
                )}
              </SummaryDashboardCard>
            </div>

            <section className="rounded-lg border border-slate-200/90 bg-white p-2.5 shadow-[0_1px_1px_rgba(15,23,42,0.04)] sm:p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Zamówione produkty — podgląd
                </h3>
                <span className="text-[10px] text-slate-400"></span>
              </div>
              <div className="mt-2 min-w-0 text-sm text-slate-800">
                <OrderSummaryProductsList
                  compact
                  lines={summaryProductsLines}
                  productEditTenantId={order.tenant_id ?? DAMAGE_TENANT_ID}
                  onLineAction={handleOrderLineMenuAction}
                />
              </div>
            </section>

              <SummaryDashboardCard
                title="Dopasowane opakowania"
                right={
                  <Link
                    to={WMS_ROUTES.packingOrder(order.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Edytuj
                  </Link>
                }
              >
                {wmsLoading ? (
                  <p className="text-xs text-slate-500">Ładowanie propozycji pakowania…</p>
                ) : (
                  <OrderMatchedPackagingSection card={wmsFulfillment} pairRecommendationColumns />
                )}
              </SummaryDashboardCard>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="min-w-0">
                  <section
                    id="order-summary-operational-notes"
                    className="rounded-lg border border-slate-200/90 bg-white p-2.5 shadow-[0_1px_1px_rgba(15,23,42,0.04)] sm:p-3"
                  >
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Notatki operacyjne</h3>
                    <div className="mt-2 space-y-1.5">
                      {order.operational_notes && order.operational_notes.length > 0 ? (
                        order.operational_notes.map((n) => (
                          <div
                            key={n.id}
                            className="rounded-lg border border-slate-100 bg-slate-50/90 px-2.5 py-2 text-sm text-slate-800"
                          >
                            <p className="whitespace-pre-wrap leading-snug">{n.content}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                              <span>{formatDetailDate(n.created_at ?? null)}</span>
                              <span>·</span>
                              <span className="font-medium text-slate-600">
                                {n.author_user_id != null ? `ID ${n.author_user_id}` : "—"}
                              </span>
                              {n.show_in_picking ? (
                                <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 font-semibold text-slate-700">
                                  WMS Zbieranie
                                </span>
                              ) : null}
                              {n.show_in_packing ? (
                                <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 font-semibold text-slate-700">
                                  WMS Pakowanie
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500">Brak notatek operacyjnych.</p>
                      )}
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                        Wstaw z szablonu
                        <select className={inpSm} defaultValue="">
                          <option value="">—</option>
                        </select>
                      </label>
                      <textarea
                        value={opDraft}
                        onChange={(e) => setOpDraft(e.target.value)}
                        rows={3}
                        placeholder="Treść notatki dla magazynu…"
                        className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                      />
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-800">
                          <label className="inline-flex cursor-pointer items-center gap-1.5">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300"
                              checked={opVisPick}
                              onChange={(e) => setOpVisPick(e.target.checked)}
                            />
                            WMS zbieranie
                          </label>
                          <label className="inline-flex cursor-pointer items-center gap-1.5">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300"
                              checked={opVisPack}
                              onChange={(e) => setOpVisPack(e.target.checked)}
                            />
                            WMS pakowanie
                          </label>
                        </div>
                        <button
                          type="button"
                          disabled={opSaving || !opDraft.trim()}
                          onClick={() => void saveOperationalNote()}
                          className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {opSaving ? "…" : "Zapisz notatkę"}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
                <div className="min-w-0">
                  <SummaryDashboardCard title="Wiadomość do klienta">
                    <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 shadow-sm ring-1 ring-slate-200">
                        E-mail
                      </span>
                      <button type="button" className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white">
                        SMS
                      </button>
                    </div>
                    <label className="mt-2 flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                      Wstaw z szablonu
                      <select className={inpSm} defaultValue="">
                        <option value="">—</option>
                      </select>
                    </label>
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={4}
                      placeholder="Wpisz treść wiadomości…"
                      className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Dodaj załącznik
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-600"
                      >
                        Wyślij
                      </button>
                    </div>
                  </SummaryDashboardCard>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="min-w-0">
                  <SummaryDashboardCard title="Wideo WMS">
                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="w-full min-w-[420px] border-collapse text-left text-[11px]">
                        <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="border-b border-slate-100 px-2 py-1.5">Data</th>
                            <th className="border-b border-slate-100 px-2 py-1.5">Typ</th>
                            <th className="border-b border-slate-100 px-2 py-1.5">Autor</th>
                            <th className="border-b border-slate-100 px-2 py-1.5">Wygasa</th>
                            <th className="border-b border-slate-100 px-2 py-1.5 text-right">Akcje</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colSpan={5} className="px-2 py-4 text-center text-slate-500">
                              Brak nagrań przypisanych do zamówienia.
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </SummaryDashboardCard>
                </div>
                <div className="min-w-0">
                  <SummaryDashboardCard title="WMS — operatorzy">
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                          <span className="inline-flex rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            W zbieraniu
                          </span>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-800">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {(timelinePickEvt?.user_label ?? timelinePickEvt?.title ?? "").trim() || "—"}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {timelinePickEvt?.at ? formatDetailDate(timelinePickEvt.at) : "—"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {contact.phone !== "—" ? (
                                <a
                                  href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                  aria-label="Telefon"
                                >
                                  <Phone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                </a>
                              ) : null}
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-400">
                                <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                          <span className="inline-flex rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            W pakowaniu
                          </span>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-800">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {(timelinePackEvt?.user_label ?? timelinePackEvt?.title ?? "").trim() || "—"}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {timelinePackEvt?.at ? formatDetailDate(timelinePackEvt.at) : "—"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {contact.phone !== "—" ? (
                                <a
                                  href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                  aria-label="Telefon"
                                >
                                  <Phone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                </a>
                              ) : null}
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-400">
                                <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Koszyk / wózek:{" "}
                        <span className="font-mono font-semibold text-slate-900">
                          {(wmsFulfillment?.basket_code ?? wmsFulfillment?.wms_vehicle_label ?? "").trim() || "—"}
                        </span>
                      </p>
                    </div>
                  </SummaryDashboardCard>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="min-w-0">
                  <SummaryDashboardCard title="Safe Order">
                    <div className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                      <Shield className="h-9 w-9 shrink-0 text-blue-600" strokeWidth={1.5} aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">Brak sygnałów ryzyka</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                          To zamówienie nie ma aktywnych oznaczeń fraud w podglądzie operatorskim.
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            + Moje oznaczenia
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            + Społeczność
                          </button>
                        </div>
                      </div>
                    </div>
                  </SummaryDashboardCard>
                </div>
                <div className="min-w-0">
                  <SummaryDashboardCard title="Dodatkowe pola">
                    <OrderAdditionalFieldsSection
                      orderId={order.id}
                      documents={order.order_documents ?? []}
                      onOrderRefresh={() => void reloadOrderById(order.id)}
                    />
                  </SummaryDashboardCard>
                </div>
              </div>

          <section className="rounded-lg border border-slate-200/90 bg-white p-2.5 shadow-[0_1px_1px_rgba(15,23,42,0.04)] sm:p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Logi czynności</h3>
              <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" strokeWidth={2} aria-hidden />
                <input
                  type="search"
                  value={summaryLogSearch}
                  onChange={(e) => setSummaryLogSearch(e.target.value)}
                  placeholder="Znajdź"
                  className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-[11px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                />
              </div>
            </div>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[560px] border-collapse text-left text-[11px]">
                <thead className="sticky top-0 z-[1] bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_rgba(226,232,240,0.9)]">
                  <tr>
                    <th className="border-b border-slate-100 px-2 py-1.5">Czas</th>
                    <th className="border-b border-slate-100 px-2 py-1.5">Zdarzenie</th>
                    <th className="border-b border-slate-100 px-2 py-1.5">Komunikat</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryPanelLogs.map((row) => (
                    <tr
                      key={String(row.id)}
                      className={
                        row.severity === "error"
                          ? "bg-red-50/90 text-red-900"
                          : row.severity === "warn"
                            ? "bg-amber-50/80 text-amber-950"
                            : "bg-white text-slate-800"
                      }
                    >
                      <td className="border-b border-slate-50 px-2 py-1 align-top font-mono text-[10px] text-slate-500">
                        {row.at}
                      </td>
                      <td className="border-b border-slate-50 px-2 py-1 align-top text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        {row.kind}
                      </td>
                      <td className="border-b border-slate-50 px-2 py-1 align-top">{row.msg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
            </div>
            <aside className="flex w-full max-w-full shrink-0 flex-col gap-4 lg:sticky lg:top-3 lg:z-0 lg:w-[360px] lg:min-w-[360px] lg:max-w-[360px] lg:max-h-[calc(100dvh-5.75rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:self-start">
              <SummaryDashboardCard
                className={SUMMARY_TOP_CARD_SHELL}
                contentClassName="mt-3"
                title="Kupujący"
                right={
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label="Edytuj kupującego"
                    onClick={() => setEditBuyerModalOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </button>
                }
              >
                <div className="space-y-1.5 text-[11px] leading-snug text-slate-800">
                  <p className="font-semibold text-slate-900">{contact.name}</p>
                  {order.customer ? (
                    <Link
                      to={`/customers/${order.customer.id}`}
                      className="inline-flex font-medium text-blue-700 hover:underline"
                    >
                      {order.customer.display_name}
                    </Link>
                  ) : null}
                  <p className="tabular-nums text-slate-700">{contact.phone}</p>
                  <p className="break-all text-slate-700">{contact.email}</p>
                </div>
              </SummaryDashboardCard>

              <SummaryDashboardCard title="Podsumowanie zamówienia">
                <div className="rounded-lg border border-amber-200/80 bg-amber-50/95 px-2.5 py-2 text-[13px] leading-snug text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                  {(wmsFulfillment?.customer_comment ?? "").trim() ||
                  (order.latest_customer_comment_preview ?? "").trim() ? (
                    (wmsFulfillment?.customer_comment ?? order.latest_customer_comment_preview ?? "").trim()
                  ) : (
                    <span className="text-amber-800/80">Brak uwag od klienta przy zamówieniu.</span>
                  )}
                </div>
                <div className="mt-2 space-y-0">
                  <SummaryCompactRow
                    label="Źródło"
                    value={(order.source ?? "").trim() || "—"}
                  />
                  <SummaryCompactRow
                    label="ID zewnętrzne"
                    value={
                      (order.external_id ?? "").trim()
                        ? (order.external_id ?? "").trim().length > 28
                          ? `${(order.external_id ?? "").trim().slice(0, 14)}…${(order.external_id ?? "").trim().slice(-8)}`
                          : (order.external_id ?? "").trim()
                        : "—"
                    }
                  />
                  <SummaryCompactRow label="Wartość produktów" value={linesTotalDisplay} />
                  <SummaryCompactRow
                    label="Koszt dostawy"
                    value={
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {order.panel_shipping_cost != null && Number.isFinite(Number(order.panel_shipping_cost))
                          ? formatMoney(Number(order.panel_shipping_cost), order.currency)
                          : (order.panel_shipping_cost_display ?? "").trim() || "—"}
                        {/(allegro)/i.test((order.source ?? "").trim()) ? (
                          <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                            SMART
                          </span>
                        ) : null}
                      </span>
                    }
                  />
                  <SummaryCompactRow
                    label="Razem"
                    value={
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>{formatMoney(order.value, order.currency)}</span>
                        {paymentStatusIsPaid(order.panel_payment_status) ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-900">
                            Opłacone
                          </span>
                        ) : null}
                      </span>
                    }
                  />
                  <SummaryCompactRow label="Realizacja" value={summaryEstimatedDelivery} />
                </div>
              </SummaryDashboardCard>

              <SummaryDashboardCard title="Rabat i marża">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOrderRabatMode("pct")}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      orderRabatMode === "pct" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderRabatMode("pln")}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      orderRabatMode === "pln" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {(order.currency ?? "PLN").trim() || "PLN"}
                  </button>
                  <input
                    className="min-w-[6rem] flex-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-900"
                    inputMode="decimal"
                    value={orderRabatDraft}
                    onChange={(e) => setOrderRabatDraft(e.target.value)}
                    placeholder="Rabat"
                  />
                  <button
                    type="button"
                    disabled={orderRabatSaving}
                    onClick={() => void saveOrderDiscount()}
                    className="rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {orderRabatSaving ? "…" : "Zapisz"}
                  </button>
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-slate-800">
                  <div className="flex justify-between gap-2 border-b border-slate-50 py-0.5">
                    <span className="text-slate-500">Po rabacie</span>
                    <span className="font-medium tabular-nums">{formatMoney(productsAfterDiscount, order.currency)}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-slate-50 py-0.5">
                    <span className="text-slate-500">Marża %</span>
                    <span className={`font-semibold tabular-nums ${marginTone}`}>
                      {order.margin != null && Number.isFinite(Number(order.margin))
                        ? `${Number(order.margin).toFixed(2)}%`
                        : "—"}
                    </span>
                  </div>
                </div>
              </SummaryDashboardCard>
            </aside>
            </div>
            </div>
          ) : null}

          {order ? (
            <EditBuyerModal
              open={editBuyerModalOpen}
              onClose={() => setEditBuyerModalOpen(false)}
              orderId={order.id}
              initialFirstName={(order.first_name ?? "").trim()}
              initialLastName={(order.last_name ?? "").trim()}
              initialPhone={contact.phone === "—" ? "" : contact.phone}
              initialEmail={contact.email === "—" ? "" : contact.email}
              canSave={warehouseId != null}
              onSaved={() => void reloadOrderById(order.id)}
            />
          ) : null}

          {activeTab === "docs" ? (
          <div className="w-full min-w-0 space-y-3">
          {docUploadErr ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{docUploadErr}</p>
          ) : null}
          {docUploadBusy ? <p className="text-xs text-slate-500">Trwa wgrywanie dokumentu…</p> : null}
          <OrderDocFilesTableSection
            title={`Dokumenty (${docsTabDocumentsRows.length})`}
            rows={docsTabDocumentsRows}
            showTypeColumn
            onUploadFiles={(files) => handleOrderDocUpload("docs", files)}
            onToolbarPrint={() => console.log("[toolbar print] dokumenty")}
            onToolbarEmail={() => console.log("[email toolbar] dokumenty")}
            onPreview={handleOrderDocPreview}
            onPrint={handleOrderDocPrint}
            onDownload={handleOrderDocDownload}
            onEmail={handleOrderDocEmail}
            onDelete={(row) => handleOrderDocDelete("docs", row)}
          />
          <OrderDocFilesTableSection
            title={`Pliki (${docsTabFilesRows.length})`}
            rows={docsTabFilesRows}
            showTypeColumn
            onUploadFiles={(files) => handleOrderDocUpload("files", files)}
            onToolbarPrint={() => console.log("[toolbar print] pliki")}
            onToolbarEmail={() => console.log("[email toolbar] pliki")}
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
            onUploadFiles={(files) => handleOrderDocUpload("waybills", files)}
            onToolbarPrint={() => console.log("[toolbar print] listy przewozowe")}
            onToolbarEmail={() => console.log("[email toolbar] listy przewozowe")}
            onPreview={handleOrderDocPreview}
            onPrint={handleOrderDocPrint}
            onDownload={handleOrderDocDownload}
            onEmail={handleOrderDocEmail}
            onDelete={(row) => handleOrderDocDelete("waybills", row)}
          />

          </div>
          ) : null}

          {activeTab === "products" ? (
          <div className="grid w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <main className="min-w-0">
        <section className="border-0 border-b border-slate-200/80 bg-transparent p-0 pb-1 sm:pb-2">
          {wmsErr ? (
            <p className="mb-3 border-l-4 border-amber-400 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">{wmsErr}</p>
          ) : null}
          {warehouseId != null ? (
            <OrderMissingProductsSection
              tenantId={DAMAGE_TENANT_ID}
              orderId={order.id}
              lines={wmsFulfillment?.lines ?? []}
              itemWaitingById={itemWaitingById}
              onRefreshOrder={() => void reloadOrderById(order.id)}
              onRefreshWms={() => void loadWmsFulfillment()}
              sectionDomId="wms-braki-sekcja"
            />
          ) : null}
          <div className="mt-2 min-w-0 space-y-2 lg:mt-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Zamówione produkty</h2>
                  {historyChangeCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setReplacementHistoryOpen((v) => !v)}
                      className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                    >
                      Historia zmian ({historyChangeCount})
                      <span className="ml-1 text-slate-500">{replacementHistoryOpen ? "▲" : "▼"}</span>
                    </button>
                  ) : null}
                  {missingProductBadgeCount > 0 ? (
                    <span className="inline-flex rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-950">
                      Braki ({missingProductBadgeCount})
                    </span>
                  ) : null}
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={showZeroQtyHistoryRows}
                      onChange={(e) => setShowZeroQtyHistoryRows(e.target.checked)}
                    />
                    Pokaż historię zmian
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddProductOpen(true)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Dodaj produkt
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddBundleOpen(true)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Dodaj zestaw
                  </button>
                  <Link
                    to={WMS_ROUTES.packingOrder(order.id)}
                    className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                  >
                    Spakuj
                  </Link>
                </div>
              </div>

              {replacementHistoryOpen && historyChangeCount > 0 ? (
                <div className="mt-4 space-y-4">
                  {replacementPairs.length > 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/95 px-4 py-3 text-sm text-slate-900 shadow-sm">
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">Zamiany w zamówieniu</p>
                      <ol className="mt-2 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-slate-500">
                        {replacementPairs.map((p) => (
                          <li key={p.sourceOrderItemId} className="pl-1">
                            <span className="font-medium text-slate-800">{p.fromLabel}</span>
                            <span className="mx-1.5 font-semibold text-slate-400">→</span>
                            <span className="font-medium text-slate-900">{p.toLabel}</span>
                            {p.qtyDisplay !== "—" ? (
                              <span className="text-slate-600"> ({p.qtyDisplay})</span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  {panelFulfillmentHistory.length > 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-800 shadow-sm">
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                        Usunięcia i rozwiązania braków
                      </p>
                      <ul className="mt-2 space-y-3">
                        {panelFulfillmentHistory.map((entry, idx) => {
                          const nm = (entry.product_name ?? "").trim();
                          const q = entry.quantity_ordered;
                          const up = entry.unit_price;
                          const lt = entry.line_total;
                          const hasSnap = Boolean(nm) && q != null && Number.isFinite(Number(q));
                          const kind = (entry.kind ?? "").trim();
                          const statusLabel =
                            kind === "order_line_removed"
                              ? "USUNIĘTO Z ZAMÓWIENIA"
                              : kind === "shortage_reduced"
                                ? "ZMNIEJSZONO ZAMÓWIENIE (BRAK)"
                                : null;
                          const qtyN = q != null && Number.isFinite(Number(q)) ? Number(q) : 0;
                          const multiline =
                            hasSnap && up != null && Number.isFinite(Number(up))
                              ? `${qtyN} szt. × ${formatMoney(up, order.currency)} = ${formatMoney(lt ?? undefined, order.currency)}`
                              : hasSnap
                                ? `${qtyN} szt. · ${formatMoney(lt ?? undefined, order.currency)}`
                                : null;
                          return (
                            <li
                              key={`${entry.at}-${idx}`}
                              className="border-t border-slate-200/70 pt-2.5 text-slate-600 first:border-t-0 first:pt-0"
                            >
                              <p className="text-[11px] font-medium text-slate-500">{formatDetailDate(entry.at)}</p>
                              {hasSnap ? (
                                <div className="mt-1.5 opacity-[0.92]">
                                  <p className="font-semibold leading-snug text-slate-700 line-through decoration-slate-300">{nm}</p>
                                  {statusLabel ? (
                                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-800">{statusLabel}</p>
                                  ) : null}
                                  {multiline ? (
                                    <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">{multiline}</p>
                                  ) : null}
                                  {!multiline && hasSnap ? (
                                    <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">{qtyN} szt.</p>
                                  ) : null}
                                </div>
                              ) : null}
                              {entry.lines?.length ? (
                                <div className={`space-y-0.5 whitespace-pre-line text-xs text-slate-600 ${hasSnap ? "mt-1.5" : "mt-0.5"}`}>
                                  {entry.lines.map((ln, i) => (
                                    <p key={i}>{ln}</p>
                                  ))}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-6 min-w-0">
                <OrderWarehouseProductsSection
                  lines={summaryProductsLines}
                  orderItems={order.items}
                  wmsByItemId={wmsByItemId}
                  wmsFulfillment={wmsFulfillment}
                  wmsLoading={wmsLoading}
                  currency={order.currency}
                  productEditTenantId={order.tenant_id ?? DAMAGE_TENANT_ID}
                  orderId={order.id}
                  linesTotalDisplay={linesTotalDisplay}
                  itemWaitingById={itemWaitingById}
                  onRefreshOrder={() => void reloadOrderById(order.id)}
                  onRefreshWms={() => void loadWmsFulfillment()}
                  onReplaceProduct={(oid) => {
                    setTableReplaceItemId(oid);
                    setTableReplaceOpen(true);
                  }}
                  onLineAction={handleOrderLineMenuAction}
                  formatMoney={formatMoney}
                  hideLineTotalHeader
                  panelFulfillmentHistory={panelFulfillmentHistory}
                  formatDetailDate={formatDetailDate}
                  showProductLineHistory={showZeroQtyHistoryRows}
                />
              </div>

              <OrderMatchedPackagingSection card={wmsFulfillment} />
          </div>

          {tableReplaceOpen && tableReplaceItemId != null && tableReplaceContext ? (
            <OrderReplaceProductModal
              open
              onClose={() => {
                setTableReplaceOpen(false);
                setTableReplaceItemId(null);
              }}
              orderId={order.id}
              tenantId={DAMAGE_TENANT_ID}
              orderItemId={tableReplaceItemId}
              sourceProductId={tableReplaceContext.sourceProductId}
              sourceProductName={tableReplaceContext.sourceProductName}
              missingQuantity={tableReplaceContext.missingQuantity}
              warehouseId={warehouseId}
              onReplaced={() => {
                void (async () => {
                  await reloadOrderById(order.id);
                  await loadWmsFulfillment();
                  dispatchWmsShortagesUpdated();
                  setTableReplaceOpen(false);
                  setTableReplaceItemId(null);
                })();
              }}
            />
          ) : null}
        </section>
        </main>
          <aside
            className="flex w-full max-w-full shrink-0 flex-col gap-4 border-t border-slate-200 pt-3 lg:sticky lg:top-3 lg:z-0 lg:w-[360px] lg:min-w-[360px] lg:max-w-[360px] lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"
            aria-label="Produkty i magazyn — czasy WMS i historia"
          >
            <WmsOperationTimesKpiPanel cells={wmsSidebarTimeCells} />
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
              <OrderHistoryTimeline compact events={orderHistoryTimelineEvents} formatDate={formatDetailDate} />
            </div>
          </aside>

          </div>
          ) : null}

          <OrderEditProductModal
            open={editProductItem != null}
            onClose={() => {
              setEditProductItem(null);
              setEditProductModalFocus("main");
            }}
            orderId={order.id}
            item={editProductItem}
            focusSection={editProductModalFocus}
            currency={(order.currency ?? "PLN").trim() || "PLN"}
            onSaved={() => {
              void (async () => {
                await reloadOrderById(order.id);
                await loadWmsFulfillment();
              })();
            }}
          />
          {summaryLineRemoveItemId != null ? (
            <ConfirmModal
              title="Usunąć pozycję?"
              message={
                <>
                  Czy na pewno usunąć pozycję „
                  <span className="font-medium text-slate-100">
                    {(order.items.find((i) => i.id === summaryLineRemoveItemId)?.product?.name ?? "").trim() || "produkt"}
                  </span>
                  ” z zamówienia?
                </>
              }
              confirmLabel="Usuń"
              pending={summaryLineRemovePending}
              onCancel={() => {
                if (!summaryLineRemovePending) setSummaryLineRemoveItemId(null);
              }}
              onConfirm={async () => {
                const id = summaryLineRemoveItemId;
                if (id == null) return;
                setSummaryLineRemovePending(true);
                try {
                  await deleteOrderItemLine(order.id, id);
                  await reloadOrderById(order.id);
                  await loadWmsFulfillment();
                  dispatchWmsShortagesUpdated();
                  setSummaryLineRemoveItemId(null);
                } catch {
                  window.alert("Nie udało się usunąć pozycji.");
                } finally {
                  setSummaryLineRemovePending(false);
                }
              }}
            />
          ) : null}

          {activeTab === "comms" ? (
          <div className="grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-4">
            <main className="min-w-0 space-y-4">
              <section
                id="order-operational-notes"
                className="space-y-2 rounded-lg border border-slate-200/90 bg-slate-50/40 p-3"
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Notatki operacyjne (magazyn)
                </h3>
                <textarea
                  value={opDraft}
                  onChange={(e) => setOpDraft(e.target.value)}
                  rows={3}
                  placeholder="Np. delikatny towar, gratis, priorytet składowania…"
                  className="w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-800">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={opVisPick}
                      onChange={(e) => setOpVisPick(e.target.checked)}
                    />
                    Zbieranie
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={opVisPack}
                      onChange={(e) => setOpVisPack(e.target.checked)}
                    />
                    Pakowanie
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={opVisRet}
                      onChange={(e) => setOpVisRet(e.target.checked)}
                    />
                    Zwroty
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={opVisComp}
                      onChange={(e) => setOpVisComp(e.target.checked)}
                    />
                    Reklamacje
                  </label>
                </div>
                <div>
                  <button
                    type="button"
                    disabled={opSaving || !opDraft.trim() || !order}
                    onClick={() => void saveOperationalNote()}
                    className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {opSaving ? "Zapisywanie…" : "Zapisz notatkę operacyjną"}
                  </button>
                </div>
                {order?.operational_notes && order.operational_notes.length > 0 ? (
                  <ul className="space-y-2 border-t border-slate-200/80 pt-3 text-sm text-slate-800">
                    {order.operational_notes.map((n) => (
                      <li key={n.id} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {[
                            n.show_in_picking ? "Zbieranie" : null,
                            n.show_in_packing ? "Pakowanie" : null,
                            n.show_in_returns ? "Zwroty" : null,
                            n.show_in_complaints ? "Reklamacje" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Ogólne"}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap leading-snug">{n.content}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Nowa wiadomość</h3>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-600 shadow-sm ring-1 ring-slate-200"
                    >
                      <span className="text-blue-600">✓</span> E-mail
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
                    >
                      SMS
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
                    >
                      SMS SA CALL
                    </button>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-initial sm:justify-end">
                    <span className="text-xs text-slate-500">Szablon wiadomości</span>
                    <select
                      className="max-w-[14rem] shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                      defaultValue="__template__"
                    >
                      <option value="__template__">Szablon wiadomości</option>
                    </select>
                  </div>
                </div>
                <div className="relative">
                  <textarea
                    id="order-comms-note"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    rows={4}
                    placeholder="Wpisz"
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 pb-9 pt-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                  <div className="pointer-events-none absolute bottom-2 right-2">
                    <button
                      type="button"
                      className="pointer-events-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                    >
                      🪄 Sugestia AI
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Dodaj załącznik
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    Wyślij
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Historia korespondencji
                    </h3>
                    {order ? (
                      <p className="mt-1 text-[11px] leading-snug text-slate-400">
                        (Utw. {formatDetailDate(order.created_at)} | Ost. wiad.{" "}
                        {formatDetailDate(order.order_date ?? order.created_at)} | Ost. odp.{" "}
                        {formatDetailDate(order.created_at)})
                      </p>
                    ) : null}
                  </div>
                  <div className="relative w-full shrink-0 sm:w-52">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <input
                      type="search"
                      placeholder="Szukaj"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">{dateLine}</span>
                    <span className="mx-1.5 text-slate-400">·</span>
                    <span>System — utworzenie zamówienia w systemie</span>
                  </div>
                  {wmsFulfillment?.customer_comment ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200 border-l-4 border-l-blue-500 bg-white">
                      <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-3 py-2">
                        <span className="text-xs font-medium text-slate-400">Import</span>
                        <span className="text-sm font-semibold text-slate-900">{contact.name}</span>
                        <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                          Najnowsza wiadomość
                        </span>
                      </div>
                      <p className="px-3 py-2.5 text-sm leading-relaxed text-slate-800">{wmsFulfillment.customer_comment}</p>
                    </div>
                  ) : null}
                  {wmsFulfillment?.staff_notes ? (
                    <div className="overflow-hidden rounded-lg border border-emerald-200 border-l-4 border-l-emerald-600 bg-emerald-50/80">
                      <div className="border-b border-emerald-200/80 px-3 py-2">
                        <span className="text-xs font-medium text-slate-400">Magazyn</span>
                      </div>
                      <p className="px-3 py-2.5 text-sm leading-relaxed text-emerald-950">{wmsFulfillment.staff_notes}</p>
                    </div>
                  ) : (
                    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      Brak wpisów z WMS — notatki magazynowe pojawią się po zapisie w terminalu.
                    </div>
                  )}
                </div>
              </section>
            </main>
            <aside
              className="flex min-w-0 flex-col gap-2 border-t border-slate-200 pt-3 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-5.5rem)] lg:w-full lg:max-w-none lg:overflow-y-auto lg:overflow-x-hidden lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"
              aria-label="Komunikacja — klient i kontekst"
            >
              <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Notatka AI</h3>
                <p className="mt-1 text-[11px] leading-snug text-slate-600">
                  Krótki kontekst dla operatora (placeholder — podłączenie modelu później).
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Klient</h3>
                  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                    Brak ryzyka
                  </span>
                </div>
                <div className="mt-2 space-y-1.5 text-xs text-slate-800">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <User className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                    <span className="min-w-0 font-semibold text-slate-900">{contact.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-medium uppercase text-slate-500">
                      all
                    </span>
                    <span className="font-mono text-slate-700">
                      {contact.email !== "—" && contact.email.trim()
                        ? contact.email.split("@")[0] || "—"
                        : order?.customer?.display_name?.trim().replace(/\s+/g, "").toLowerCase() || "—"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="tabular-nums">{contact.phone}</span>
                    {contact.phone !== "—" ? (
                      <a
                        href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        aria-label="Zadzwoń"
                      >
                        <Phone className="h-3 w-3" strokeWidth={2} aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>
          </div>
          ) : null}

          {activeTab === "logs" ? (
          <div className="min-w-0 space-y-2">
            <section className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-none sm:p-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Zdarzenia systemowe</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-800">
                <li className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 py-1.5">
                  <span className="font-mono text-xs text-slate-500">{formatDetailDate(order.created_at)}</span>
                  <span>Utworzono zamówienie <strong>Numer {order.id}</strong></span>
                </li>
                <li className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 py-1.5">
                  <span className="text-xs text-slate-500">Źródło</span>
                  <span>{(order.source ?? "—").trim() || "—"}</span>
                </li>
                <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                  <span className="text-xs text-slate-500">Status panelu</span>
                  <div className="min-w-0 max-w-md">
                    <OrderUiStatusConfigRowPresent status={order.order_ui_status ?? null} variant="compact" />
                  </div>
                </li>
              </ul>
            </section>
            <section className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-none sm:p-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Dziennik panelu</h3>
              {(order.order_activity_logs ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Brak wpisów.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-800">
                  {(order.order_activity_logs ?? []).map((log) => (
                    <li
                      key={log.id}
                      className="flex flex-col gap-1 border-b border-slate-100 py-1.5 last:border-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3"
                    >
                      <span className="shrink-0 font-mono text-xs text-slate-500">
                        {formatDetailDate(log.created_at ?? null)}
                      </span>
                      <span className="inline-flex w-fit rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                        {log.event_type}
                      </span>
                      <span className="min-w-0 text-slate-800">{log.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          ) : null}

            </div>
            </div>
          </div>

      {orderDocPreviewModal != null ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-doc-preview-title"
          onClick={() => setOrderDocPreviewModal(null)}
        >
          <div
            className="max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="order-doc-preview-title" className="text-sm font-semibold text-slate-900">
              Podgląd
            </p>
            <p className="mt-2 text-sm text-slate-700">{orderDocPreviewModal}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => setOrderDocPreviewModal(null)}
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {docTypeModalFile ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-doc-type-modal-title"
          onClick={() => !docUploadBusy && setDocTypeModalFile(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="order-doc-type-modal-title" className="text-sm font-semibold text-slate-900">
              Typ dokumentu
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {docTypeModalFile.name} — wybierz rodzaj przed wgraniem.
            </p>
            <label className="mt-4 flex flex-col gap-1 text-xs text-slate-600">
              Rodzaj
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
                value={docTypeModalChoice}
                disabled={docUploadBusy}
                onChange={(e) => setDocTypeModalChoice(e.target.value as OrderDocModalType)}
              >
                {ORDER_DOCUMENT_MODAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {orderDocumentTypeToLabel(t).name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                disabled={docUploadBusy}
                onClick={() => setDocTypeModalFile(null)}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                disabled={docUploadBusy}
                onClick={handleConfirmDocTypeModal}
              >
                {docUploadBusy ? "Wgrywanie…" : "Wgraj"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <OrderAddProductModal
        open={addProductOpen}
        onClose={() => setAddProductOpen(false)}
        tenantId={DAMAGE_TENANT_ID}
        orderId={order.id}
        currency={(order.currency ?? "PLN").trim() || "PLN"}
        onAdded={() => {
          void (async () => {
            await reloadOrderById(order.id);
            await loadWmsFulfillment();
            dispatchWmsShortagesUpdated();
          })();
        }}
      />

      <OrderAddBundleModal
        open={addBundleOpen}
        onClose={() => setAddBundleOpen(false)}
        tenantId={order.tenant_id ?? DAMAGE_TENANT_ID}
        orderId={order.id}
        currency={(order.currency ?? "PLN").trim() || "PLN"}
        onAdded={() => {
          void (async () => {
            await reloadOrderById(order.id);
            await loadWmsFulfillment();
            dispatchWmsShortagesUpdated();
          })();
        }}
      />

      {warehouseId != null ? (
        <NewComplaintWizard
          open={complaintWizardOpen}
          onClose={() => {
            setComplaintWizardOpen(false);
            setComplaintPrefillItemIds(undefined);
          }}
          warehouseId={warehouseId}
          initialOrderId={order?.id ?? null}
          initialOrderItemIds={complaintPrefillItemIds}
          onCreated={(cid) => navigate(`/orders/complaints/${cid}`)}
        />
      ) : null}
    </>
  );
}
