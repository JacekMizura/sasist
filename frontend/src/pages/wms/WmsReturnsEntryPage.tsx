import type { Ref } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import api from "../../api/axios";
import { listComplaints } from "../../api/complaintsApi";
import {
  createWmsReturn,
  listWmsReturnsForOrder,
  lookupOrdersForWms,
  normalizeWmsReturnsSearchQuery,
} from "../../api/wmsReturnsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { ComplaintListItem } from "../../types/complaint";
import { complaintRowStatusPresentation, normalizeComplaintStatus } from "../../types/complaint";
import type { ReturnStatusBrief, WmsReturnListItem } from "../../types/wmsReturn";
import { wmsReturnShowsFreshIncomingBadge } from "../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "./wmsRoutes";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import { formatWmsListDate } from "./wmsListFormatters";

type OrderItemRow = {
  id: number;
  quantity: number;
  product: {
    id: number;
    name?: string | null;
    ean?: string | null;
    sku?: string | null;
    symbol?: string | null;
    image_url?: string | null;
  };
};

type OrderDetail = {
  id: number;
  tenant_id?: number;
  warehouse_id?: number;
  number?: string | null;
  external_id?: string | null;
  sales_document_number?: string | null;
  status?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  order_date?: string | null;
  created_at?: string | null;
  addresses_json?: string | null;
  items: OrderItemRow[];
};

type WmsReturnsQueueFilter = "all" | "returns" | "complaints";

type MergedQueueEntry =
  | { kind: "return"; sortTs: number; id: number; ret: WmsReturnListItem }
  | { kind: "complaint"; sortTs: number; id: number; cmp: ComplaintListItem };

function parseListSortTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function clipLine(s: string | null | undefined, max = 72): string {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function wmsReturnListUnitsAndLineCount(r: WmsReturnListItem): { lineCount: number; unitSum: number } {
  const rows =
    r.lines && Array.isArray(r.lines) && r.lines.length > 0
      ? r.lines
      : r.lines_preview && r.lines_preview.length > 0
        ? r.lines_preview
        : [];
  let unitSum = 0;
  for (const row of rows) {
    const q = Number((row as { quantity?: unknown }).quantity);
    if (Number.isFinite(q) && q > 0) unitSum += Math.floor(q);
  }
  const lineCount = rows.length;
  if (lineCount > 0 && unitSum === 0) unitSum = lineCount;
  return { lineCount, unitSum };
}

function returnQueueSummaryLine(r: WmsReturnListItem): string | null {
  const { lineCount, unitSum } = wmsReturnListUnitsAndLineCount(r);
  if (lineCount <= 0) return null;
  const mod10 = lineCount % 10;
  const mod100 = lineCount % 100;
  const posWord =
    lineCount === 1
      ? "pozycja"
      : mod100 >= 12 && mod100 <= 14
        ? "pozycji"
        : mod10 >= 2 && mod10 <= 4
          ? "pozycje"
          : "pozycji";
  return `${lineCount} ${posWord} • ${unitSum} szt.`;
}

function complaintListLinesCount(c: ComplaintListItem): number {
  if (c.lines_count != null && Number.isFinite(Number(c.lines_count))) {
    return Math.max(0, Math.floor(Number(c.lines_count)));
  }
  return 1;
}

function complaintQueuePositionSummary(c: ComplaintListItem): string {
  const n = complaintListLinesCount(c);
  if (n === 0) return "0 pozycji reklamacyjnych";
  if (n === 1) return "1 pozycja reklamacyjna";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 12 && mod100 <= 14) return `${n} pozycji reklamacyjnych`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} pozycje reklamacyjne`;
  return `${n} pozycji reklamacyjnych`;
}

function orderDocSubtitle(sales_document_number?: string | null): string | null {
  const doc = (sales_document_number || "").trim();
  return doc ? `Dok. sprz.: ${doc}` : null;
}

function headerCustomerFromOrder(o: OrderDetail): string {
  const a = (o.first_name || "").trim();
  const b = (o.last_name || "").trim();
  if (a && b) return `${a} ${b}`;
  if (a) return a;
  if (b) return b;
  return "Brak danych klienta";
}

function formatOrderNumberForSubline(
  explicit: string | null | undefined,
  fallbackId: number | null | undefined,
): string | null {
  const raw = (explicit ?? "").trim();
  if (raw) {
    const n = raw.replace(/^#/, "");
    return n ? `#${n}` : null;
  }
  if (fallbackId != null && Number.isFinite(fallbackId) && fallbackId > 0) return `#${Math.floor(fallbackId)}`;
  return null;
}

type WmsQueueRibbonTone = "green" | "gray" | "red";

type WmsQueueCardLines = {
  metaLines: string[];
  bodyLine: string | null;
  bodyExtra?: string | null;
};

function complaintQueueCardContent(c: ComplaintListItem, order: OrderDetail | null): WmsQueueCardLines {
  const metaLines: string[] = [];
  const ordLabel =
    formatOrderNumberForSubline(c.order_number, c.order_id ?? order?.id) ??
    (order ? formatOrderNumberForSubline(order.number ?? null, order.id) : null);
  if (ordLabel) metaLines.push(`Zamówienie ${ordLabel}`);
  const cn = (c.customer_name ?? "").trim();
  if (cn) metaLines.push(clipLine(cn));
  else if (order) metaLines.push(clipLine(headerCustomerFromOrder(order)));

  const bodyLine = complaintQueuePositionSummary(c);
  const cr = (c.customer_reason ?? "").trim();
  const bodyExtra = cr ? `Powód: ${clipLine(cr, 96)}` : null;
  return { metaLines: metaLines.filter(Boolean), bodyLine, bodyExtra };
}

function returnQueueCardContent(r: WmsReturnListItem, order: OrderDetail | null): WmsQueueCardLines {
  const metaLines: string[] = [];
  const ordLabel = formatOrderNumberForSubline(r.order_number, r.order_id ?? order?.id);
  if (ordLabel) metaLines.push(`Zamówienie ${ordLabel}`);
  const a = (r.first_name ?? "").trim();
  const b = (r.last_name ?? "").trim();
  const cust = `${a} ${b}`.trim();
  if (cust) metaLines.push(clipLine(cust));
  else if (order) metaLines.push(clipLine(headerCustomerFromOrder(order)));

  const bodyLine = returnQueueSummaryLine(r);
  return { metaLines: metaLines.filter(Boolean), bodyLine };
}

const RETURN_TERMINAL_KEYWORDS = new Set([
  "success",
  "done",
  "accepted",
  "closed",
  "zrealizowany",
  "zakonczony",
  "completed",
  "finished",
]);

function normStatusSearch(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\s-]+/g, "_");
}

function wmsReturnListStatusMatchesTerminalKeywords(st: ReturnStatusBrief): boolean {
  const k = normStatusSearch(st.transition_key);
  const n = normStatusSearch(st.name).replace(/_/g, " ");
  const nk = k.replace(/_/g, "");
  const nn = n.replace(/_/g, "");
  if (RETURN_TERMINAL_KEYWORDS.has(k) || RETURN_TERMINAL_KEYWORDS.has(n.replace(/\s+/g, "_"))) return true;
  if (nn.includes("zrealizow") || nn.includes("zakoncz") || nn.includes("przyjet") || nn.includes("przyjety"))
    return true;
  if (nk.includes("zrealizow") || nk.includes("zakoncz")) return true;
  return false;
}

function wmsReturnListItemIsCompleted(r: WmsReturnListItem): boolean {
  const tp = (r.status?.type ?? "").toLowerCase();
  if (tp === "done_success" || tp === "done_rejected") return true;
  return wmsReturnListStatusMatchesTerminalKeywords(r.status);
}

function wmsReturnListRibbon(r: WmsReturnListItem): { text: string; tone: WmsQueueRibbonTone } | null {
  if (!wmsReturnListItemIsCompleted(r)) return null;
  const tp = (r.status?.type ?? "").toLowerCase();
  const nn = normStatusSearch(r.status?.name).replace(/_/g, " ");
  const nk = normStatusSearch(r.status?.transition_key).replace(/_/g, "");

  const rejectish =
    tp === "done_rejected" ||
    nn.includes("odrzucon") ||
    nn.includes("reject") ||
    nk.includes("odrzucon") ||
    nk.includes("reject");
  if (rejectish) return { text: "ZAKOŃCZONY", tone: "red" };

  const successish =
    tp === "done_success" ||
    nn.includes("zrealizow") ||
    nn.includes("przyjet") ||
    nn.includes("przyjety") ||
    nn.includes("accepted") ||
    nn.includes("success") ||
    nk.includes("success") ||
    nk.includes("accepted") ||
    nk.includes("zrealizow");

  if (successish) return { text: "ZREALIZOWANY", tone: "green" };

  return { text: "ZAKOŃCZONY", tone: "gray" };
}

function complaintListItemIsCompleted(c: ComplaintListItem): boolean {
  const code = normalizeComplaintStatus(c.status);
  return code === "ZAAKCEPTOWANA" || code === "ODRZUCONA";
}

function complaintListRibbon(c: ComplaintListItem): { text: string; tone: WmsQueueRibbonTone } | null {
  const code = normalizeComplaintStatus(c.status);
  if (code === "ZAAKCEPTOWANA") return { text: "UZNANA", tone: "green" };
  if (code === "ODRZUCONA") return { text: "ODRZUCONA", tone: "red" };
  return null;
}

function WmsQueueDiagonalRibbon({ text, tone }: { text: string; tone: WmsQueueRibbonTone }) {
  const band =
    tone === "green"
      ? "bg-emerald-600"
      : tone === "red"
        ? "bg-rose-700"
        : "bg-slate-500";
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute z-[4] flex items-center justify-center whitespace-nowrap uppercase tracking-wide text-white shadow-md ${band}`}
      style={{
        top: 28,
        right: -90,
        width: "min(520px, 175%)",
        height: 44,
        fontSize: 20,
        fontWeight: 800,
        textAlign: "center",
        lineHeight: "44px",
        transform: "rotate(35deg)",
        transformOrigin: "center center",
      }}
    >
      {text}
    </span>
  );
}

const RMZ_COLOR_BADGE: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 ring-1 ring-blue-200/90",
  green: "bg-green-100 text-green-700 ring-1 ring-green-200/90",
  red: "bg-red-100 text-red-700 ring-1 ring-red-200/90",
  slate: "bg-slate-50 text-slate-800 ring-1 ring-slate-200/90",
  amber: "bg-amber-100 text-amber-900 ring-1 ring-amber-200/90",
  emerald: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/90",
  rose: "bg-rose-100 text-rose-800 ring-1 ring-rose-200/90",
  violet: "bg-violet-100 text-violet-800 ring-1 ring-violet-200/90",
  orange: "bg-orange-100 text-orange-900 ring-1 ring-orange-200/90",
  cyan: "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-200/90",
  lime: "bg-lime-100 text-lime-900 ring-1 ring-lime-200/90",
  fuchsia: "bg-fuchsia-100 text-fuchsia-900 ring-1 ring-fuchsia-200/90",
};

function rmzCardClasses(status: ReturnStatusBrief): { badge: string; label: string } {
  const key = (status.color || "blue").toLowerCase();
  const badge = RMZ_COLOR_BADGE[key] ?? RMZ_COLOR_BADGE.slate;
  return { badge, label: status.name };
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

// Funkcja dodana z powrotem - formator daty zamówienia
function formatOrderTileDate(iso?: string | null): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function pickAddrStr(obj: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function orderTileContactFromAddresses(raw: string | null | undefined): {
  phone: string | null;
  email: string | null;
  login: string | null;
} {
  if (!raw?.trim()) return { phone: null, email: null, login: null };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { phone: null, email: null, login: null };
  }
  const shipping =
    data.shipping && typeof data.shipping === "object" ? (data.shipping as Record<string, unknown>) : {};
  const billing =
    data.billing && typeof data.billing === "object" ? (data.billing as Record<string, unknown>) : {};
  const phone =
    pickAddrStr(shipping, ["Telefon", "phone", "mobile", "tel"]) ||
    pickAddrStr(billing, ["Telefon", "phone", "mobile", "tel"]) ||
    pickAddrStr(data, ["phone", "phone_number", "tel"]);
  const email =
    pickAddrStr(shipping, ["Email", "email"]) ||
    pickAddrStr(billing, ["Email", "email"]) ||
    pickAddrStr(data, ["email"]);
  const login =
    pickAddrStr(shipping, ["login", "Login", "username", "user_login"]) ||
    pickAddrStr(billing, ["login", "Login", "username", "user_login"]) ||
    pickAddrStr(data, ["login", "username", "customer_login"]);
  return { phone, email, login };
}

const LIST_CARD_THEME = {
  return: {
    border: "border-blue-200/90 hover:border-blue-400",
    bg: "bg-blue-50",
    idText: "text-blue-950",
    dateText: "text-blue-800",
    footerText: "text-blue-700",
    footerDivider: "border-t border-blue-200/70",
    topBadge: "border-blue-200 bg-blue-100 text-blue-800",
    ring: "focus-visible:ring-blue-400/60",
  },
  complaint: {
    border: "border-purple-200/90 hover:border-purple-400",
    bg: "bg-purple-50",
    idText: "text-purple-950",
    dateText: "text-purple-800",
    footerText: "text-purple-700",
    footerDivider: "border-t border-purple-200/70",
    topBadge: "border-purple-200 bg-purple-100 text-purple-800",
    ring: "focus-visible:ring-purple-400/60",
  },
} as const;

type WmsListCardTileVariant = keyof typeof LIST_CARD_THEME;

type WmsListCardTileProps = {
  variant: WmsListCardTileVariant;
  idLine: string;
  statusLabel: string;
  statusBadgeClassName: string;
  freshIncoming?: boolean;
  metaLines?: string[];
  bodyLine?: string | null;
  bodyExtra?: string | null;
  isCompleted?: boolean;
  ribbon?: { text: string; tone: WmsQueueRibbonTone } | null;
  createdAtIso?: string | null;
  onActivate: () => void;
  tileRef?: Ref<HTMLButtonElement | null>;
};

function WmsListCardTile({
  variant,
  idLine,
  statusLabel,
  statusBadgeClassName,
  freshIncoming,
  metaLines,
  bodyLine,
  bodyExtra,
  isCompleted,
  ribbon,
  createdAtIso,
  onActivate,
  tileRef,
}: WmsListCardTileProps) {
  const th = LIST_CARD_THEME[variant];
  const topLabel = variant === "return" ? "ZWROT" : "REKLAMACJA";
  const showRibbon = ribbon != null && ribbon.text.trim() !== "";
  const surface = isCompleted
    ? "border-[#d1d5db] !bg-[#f3f4f6] shadow-sm hover:shadow-md"
    : `${th.border} ${th.bg} hover:shadow-lg`;
  const idCls = isCompleted ? "text-slate-800" : th.idText;
  const metaCls = "text-slate-600";
  const bodyCls = isCompleted ? "text-slate-700" : "text-slate-800";
  const dateCls = isCompleted ? "text-slate-600" : th.dateText;
  const topBadgeCls = isCompleted ? "border-slate-200 bg-slate-200/90 text-slate-700" : th.topBadge;
  const innerMuted = isCompleted ? "opacity-[0.78] saturate-[0.7] transition group-hover:opacity-100 group-hover:saturate-100" : "";
  return (
    <button
      ref={tileRef}
      type="button"
      className={`group relative flex h-full min-h-[160px] w-full flex-col overflow-hidden rounded-xl border-2 p-4 pt-10 text-left shadow-md outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 ${surface} ${th.ring}`}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <div
        className={`relative z-[1] flex min-h-0 w-full flex-1 flex-col space-y-2 ${innerMuted}`}
      >
        <span
          className={`absolute left-0 top-0 z-[1] -translate-y-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${topBadgeCls}`}
        >
          {topLabel}
        </span>
        <span className={`pt-0.5 text-lg font-semibold tabular-nums ${idCls}`}>{idLine}</span>
        {metaLines != null && metaLines.length > 0 ? (
          <div className={`space-y-0.5 text-xs leading-snug ${metaCls}`}>
            {metaLines.filter(Boolean).map((line, li) => (
              <p key={li} className="line-clamp-2">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        {bodyLine != null && bodyLine.trim() !== "" ? (
          <p className={`text-sm font-semibold leading-snug ${bodyCls}`}>{bodyLine}</p>
        ) : null}
        {bodyExtra != null && bodyExtra.trim() !== "" ? (
          <p className={`text-xs leading-snug ${metaCls} line-clamp-2`}>{bodyExtra}</p>
        ) : null}
        <div className="flex min-h-[4px] flex-1" aria-hidden />
        <div className="flex flex-wrap items-center gap-2">
          {variant === "return" && freshIncoming && !isCompleted ? (
            <span className="inline-flex w-fit shrink-0 rounded-full border border-blue-200 bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-900 ring-1 ring-blue-200/90">
              Nowy zwrot
            </span>
          ) : null}
          <span className={`inline-flex w-fit shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${statusBadgeClassName}`}>
            {statusLabel}
          </span>
        </div>
        <span className={`mt-auto text-sm tabular-nums ${dateCls}`}>{formatWmsListDate(createdAtIso)}</span>
      </div>
      {showRibbon && ribbon ? <WmsQueueDiagonalRibbon text={ribbon.text} tone={ribbon.tone} /> : null}
    </button>
  );
}

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

export default function WmsReturnsEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<
    {
      id: number;
      number?: string | null;
      status?: string | null;
      external_id?: string | null;
      sales_document_number?: string | null;
    }[]
  >([]);
  const [err, setErr] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [orderLoadErr, setOrderLoadErr] = useState<string | null>(null);

  const [qtyByItem, setQtyByItem] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [createReturnErr, setCreateReturnErr] = useState<string | null>(null);
  const [newReturnType, setNewReturnType] = useState<"RMA" | "UNCLAIMED">("RMA");

  const [orderReturns, setOrderReturns] = useState<WmsReturnListItem[]>([]);
  const [orderReturnsLoading, setOrderReturnsLoading] = useState(false);
  const [orderReturnsErr, setOrderReturnsErr] = useState<string | null>(null);
  const [orderComplaints, setOrderComplaints] = useState<ComplaintListItem[]>([]);
  const [orderComplaintsLoading, setOrderComplaintsLoading] = useState(false);
  const [orderComplaintsErr, setOrderComplaintsErr] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<WmsReturnsQueueFilter>("all");
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [highlightReturnId, setHighlightReturnId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [returnPanelEntered, setReturnPanelEntered] = useState(false);
  const [savedReturnFlash, setSavedReturnFlash] = useState<string | null>(null);
  
  const preselectSig = useRef<string | null>(null);
  const searchRef = useRef<(overrideQ?: string) => Promise<void>>(async () => {});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const firstHitButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstQueueTileRef = useRef<HTMLButtonElement | null>(null);
  const firstQtyInputRef = useRef<HTMLInputElement | null>(null);
  const createFormSectionRef = useRef<HTMLElement | null>(null);

  const { registerScanHandler, setActiveDocument } = useWmsScanner();
  
  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Zwroty WMS" });
    registerScanHandler((ean) => {
      const code = ean.trim();
      if (!code) return;
      setQ(code);
      void searchRef.current(code);
    });
    return () => {
      registerScanHandler(null);
      setActiveDocument(null);
    };
  }, [registerScanHandler, setActiveDocument]);

  const loadReturnsForOrder = useCallback(async (orderId: number) => {
    setOrderReturnsLoading(true);
    setOrderReturnsErr(null);
    try {
      const rows = await listWmsReturnsForOrder(orderId, DAMAGE_TENANT_ID);
      setOrderReturns(rows);
    } catch {
      setOrderReturnsErr("Nie udało się wczytać zwrotów dla zamówienia.");
      setOrderReturns([]);
    } finally {
      setOrderReturnsLoading(false);
    }
  }, []);

  const loadComplaintsForOrder = useCallback(
    async (orderId: number, orderWarehouseId: number | null | undefined) => {
      setOrderComplaintsLoading(true);
      setOrderComplaintsErr(null);
      try {
        const wh =
          orderWarehouseId != null && Number.isFinite(orderWarehouseId) && orderWarehouseId > 0
            ? orderWarehouseId
            : warehouseId != null && warehouseId > 0
              ? warehouseId
              : undefined;
        const { items } = await listComplaints({
          tenant_id: DAMAGE_TENANT_ID,
          warehouse_id: wh,
          limit: 500,
          sort_by: "created_at",
          sort_dir: "desc",
        });
        setOrderComplaints((items ?? []).filter((c) => c.order_id === orderId));
      } catch {
        setOrderComplaintsErr("Nie udało się wczytać reklamacji dla zamówienia.");
        setOrderComplaints([]);
      } finally {
        setOrderComplaintsLoading(false);
      }
    },
    [warehouseId],
  );

  const applyOrderData = useCallback((data: OrderDetail) => {
    setSelectedOrder(data);
    const init: Record<number, number> = {};
    for (const it of data.items) {
      init[it.id] = 0;
    }
    setQtyByItem(init);
    setOrderLoadErr(null);
  }, []);

  const loadOrderById = useCallback(
    async (orderId: number, opts?: { highlightReturnId?: number | null; openCreateFormAfterLoad?: boolean }) => {
      if (!Number.isFinite(orderId) || orderId <= 0) return;
      setOrderLoadErr(null);
      setOrderReturns([]);
      setOrderReturnsErr(null);
      setOrderComplaints([]);
      setOrderComplaintsErr(null);
      setShowCreateForm(false);
      try {
        const or = await api.get<OrderDetail>(`orders/${orderId}/`);
        applyOrderData(or.data);
        const orderWh =
          typeof or.data.warehouse_id === "number" && Number.isFinite(or.data.warehouse_id) && or.data.warehouse_id > 0
            ? or.data.warehouse_id
            : null;
        await Promise.all([loadReturnsForOrder(orderId), loadComplaintsForOrder(orderId, orderWh)]);
        const rid = opts?.highlightReturnId;
        if (rid != null && Number.isFinite(rid) && rid > 0) {
          setHighlightReturnId(rid);
        }
        if (opts?.openCreateFormAfterLoad) {
          setCreateReturnErr(null);
          setShowCreateForm(true);
        }
      } catch {
        setSelectedOrder(null);
        setOrderReturns([]);
        setOrderLoadErr("Nie znaleziono zamówienia.");
      }
    },
    [applyOrderData, loadReturnsForOrder, loadComplaintsForOrder]
  );

  useEffect(() => {
    const st = location.state as { preselectOrderId?: number; openReturnCreateForm?: boolean } | null;
    const pid = st?.preselectOrderId;
    const openReturnCreateForm = Boolean(st?.openReturnCreateForm);
    if (pid == null || !Number.isFinite(pid) || pid <= 0) return;
    const sig = `${String(location.key)}:${pid}:${openReturnCreateForm ? "1" : "0"}`;
    if (preselectSig.current === sig) return;
    preselectSig.current = sig;
    void loadOrderById(pid, { openCreateFormAfterLoad: openReturnCreateForm }).finally(() => {
      navigate(".", { replace: true, state: {} });
    });
  }, [location.key, location.state, loadOrderById, navigate]);

  useEffect(() => {
    let msg: string | null = null;
    try {
      msg = sessionStorage.getItem("wms_returns_saved_toast");
      if (msg) sessionStorage.removeItem("wms_returns_saved_toast");
    } catch {
      /* ignore */
    }
    if (!msg?.trim()) return;
    setSavedReturnFlash(msg.trim());
    const t = window.setTimeout(() => setSavedReturnFlash(null), 4500);
    return () => window.clearTimeout(t);
  }, [location.pathname, location.key]);

  useEffect(() => {
    if (highlightReturnId == null || orderReturnsLoading) return;
    const el = rowRefs.current[highlightReturnId];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el.classList.add("ring-2", "ring-emerald-500", "ring-offset-2");
      const t = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-emerald-500", "ring-offset-2");
        setHighlightReturnId(null);
      }, 2400);
      return () => window.clearTimeout(t);
    }
  }, [highlightReturnId, orderReturnsLoading, orderReturns]);

  const firstReturnQtyRowIndex = useMemo(() => {
    if (!selectedOrder) return -1;
    return selectedOrder.items.findIndex((x) => x.quantity > 0);
  }, [selectedOrder]);

  const mergedQueueTiles = useMemo(() => {
    const ret: MergedQueueEntry[] = orderReturns.map((r) => ({
      kind: "return",
      sortTs: parseListSortTime(r.created_at ?? null),
      id: r.id,
      ret: r,
    }));
    const cmp: MergedQueueEntry[] = orderComplaints.map((c) => ({
      kind: "complaint",
      sortTs: parseListSortTime(c.created_at ?? null),
      id: c.id,
      cmp: c,
    }));
    let rows = [...ret, ...cmp];
    rows.sort((a, b) => b.sortTs - a.sortTs || b.id - a.id);
    if (queueFilter === "returns") rows = rows.filter((x) => x.kind === "return");
    if (queueFilter === "complaints") rows = rows.filter((x) => x.kind === "complaint");
    return rows;
  }, [orderReturns, orderComplaints, queueFilter]);

  useEffect(() => {
    setQueueFilter("all");
  }, [selectedOrder?.id]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!selectedOrder || orderReturnsLoading || orderComplaintsLoading || orderReturnsErr || orderComplaintsErr) return;
    const id = window.requestAnimationFrame(() => {
      if (mergedQueueTiles.length > 0) {
        firstQueueTileRef.current?.focus();
      } else if (showCreateForm && firstReturnQtyRowIndex >= 0) {
        firstQtyInputRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    selectedOrder?.id,
    orderReturnsLoading,
    orderComplaintsLoading,
    orderReturnsErr,
    orderComplaintsErr,
    orderReturns,
    orderComplaints,
    mergedQueueTiles,
    showCreateForm,
    firstReturnQtyRowIndex,
  ]);

  const search = useCallback(
    async (overrideQ?: string) => {
      const raw = (overrideQ ?? q).trim();
      if (!raw) return;

      console.log("returns lookup start", raw);
      setLoading(true);
      setErr(null);
      setOrderLoadErr(null);

      try {
        const query = normalizeWmsReturnsSearchQuery(raw);
        if (!query) {
          setHits([]);
          setSelectedOrder(null);
          setErr("Brak zamówienia dla podanego numeru lub kodu.");
          return;
        }

        const data = await lookupOrdersForWms(query, DAMAGE_TENANT_ID, warehouseId);
        console.log("returns lookup response", data);

        if (data.length === 0) {
          setHits([]);
          setSelectedOrder(null);
          setErr("Brak zamówienia dla podanego numeru lub kodu.");
          return;
        }

        setErr(null);

        if (data.length === 1) {
          setHits([]);
          const hit = data[0];
          const rid =
            hit.matched_return_id != null && Number.isFinite(hit.matched_return_id)
              ? hit.matched_return_id
              : null;
          await loadOrderById(hit.id, { highlightReturnId: rid });
          return;
        }

        setHits(data);
        setSelectedOrder(null);
        window.requestAnimationFrame(() => firstHitButtonRef.current?.focus());
      } catch (error) {
        console.error("returns lookup failed", error);
        setErr("Nie udało się wyszukać zamówienia.");
      } finally {
        setLoading(false);
      }
    },
    [q, warehouseId, loadOrderById],
  );

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const linesForCreate = useMemo(() => {
    if (!selectedOrder) return [];
    return selectedOrder.items
      .filter((it) => (qtyByItem[it.id] ?? 0) > 0)
      .map((it) => ({
        order_item_id: it.id,
        product_id: it.product.id,
        quantity: Math.min(Math.max(1, Math.floor(qtyByItem[it.id] ?? 0)), it.quantity),
      }));
  }, [selectedOrder, qtyByItem]);

  const createReturn = async () => {
    if (!selectedOrder || linesForCreate.length === 0) return;
    setSubmitting(true);
    setCreateReturnErr(null);
    try {
      const r = await createWmsReturn({
        tenant_id: DAMAGE_TENANT_ID,
        order_id: selectedOrder.id,
        return_type: newReturnType,
        lines: linesForCreate,
      });
      await Promise.all([
        loadReturnsForOrder(selectedOrder.id),
        loadComplaintsForOrder(selectedOrder.id, selectedOrder.warehouse_id ?? warehouseId),
      ]);
      setShowCreateForm(false);
      setHighlightReturnId(r.id);
      const init: Record<number, number> = {};
      for (const it of selectedOrder.items) {
        init[it.id] = 0;
      }
      setQtyByItem(init);
      window.requestAnimationFrame(() => firstQueueTileRef.current?.focus());
    } catch (e: unknown) {
      let msg = "Nie udało się utworzyć zwrotu.";
      if (typeof e === "object" && e !== null && "response" in e) {
        const data = (e as { response?: { data?: { detail?: unknown } } }).response?.data;
        const d = data?.detail;
        if (typeof d === "string" && d.trim()) msg = d.trim();
        else if (Array.isArray(d)) {
          const parts = d
            .map((row) =>
              typeof row === "object" && row !== null && "msg" in row
                ? String((row as { msg: unknown }).msg).trim()
                : String(row),
            )
            .filter((s) => s.length > 0);
          if (parts.length) msg = parts.join(" ");
        }
      }
      setCreateReturnErr(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const setQty = (itemId: number, value: number, max: number) => {
    const v = Math.max(0, Math.min(max, Math.floor(value)));
    setQtyByItem((prev) => ({ ...prev, [itemId]: v }));
  };

  const hasReturns = orderReturns.length > 0;
  const hasComplaints = orderComplaints.length > 0;
  const listLoading = orderReturnsLoading || orderComplaintsLoading;
  const orderHeaderCustomer = selectedOrder ? headerCustomerFromOrder(selectedOrder) : "";
  const orderHeaderSource = selectedOrder ? normalizeOrderSourceDisplay(selectedOrder.source) : "—";
  const orderHeaderMissingCustomer = orderHeaderCustomer === "Brak danych klienta";
  const orderTileDateLine = useMemo(() => {
    const raw = selectedOrder?.order_date || selectedOrder?.created_at;
    return formatOrderTileDate(raw ?? null);
  }, [selectedOrder?.order_date, selectedOrder?.created_at]);
  const orderTileContact = useMemo(
    () => orderTileContactFromAddresses(selectedOrder?.addresses_json),
    [selectedOrder?.addresses_json],
  );

  const openNewReturnForm = useCallback(() => {
    setCreateReturnErr(null);
    setShowCreateForm(true);
  }, []);

  const closeCreateFormPanel = useCallback(() => {
    setShowCreateForm(false);
    setCreateReturnErr(null);
  }, []);

  useEffect(() => {
    if (!showCreateForm) {
      setReturnPanelEntered(false);
      return;
    }
    setReturnPanelEntered(false);
    const id = window.requestAnimationFrame(() => {
      setReturnPanelEntered(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [showCreateForm]);

  useEffect(() => {
    if (!showCreateForm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCreateFormPanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCreateForm, closeCreateFormPanel]);

  const showScanIdle = !selectedOrder && hits.length === 0 && !loading && !orderLoadErr;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-white text-slate-800 antialiased">

      {/* Main Container */}
      <main className="flex w-full flex-1 flex-col overflow-y-auto bg-white custom-scrollbar">
        {savedReturnFlash ? (
          <div
            role="status"
            className="mx-auto mt-4 w-full max-w-xl rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm font-semibold text-emerald-900 shadow-sm"
          >
            {savedReturnFlash}
          </div>
        ) : null}

        <div className={showScanIdle ? "flex flex-1 items-center justify-center w-full" : "w-full px-4 md:px-6 pt-4 md:pt-6"}>
          
          <div className={showScanIdle ? "flex w-full max-w-2xl flex-col items-center justify-center p-4 text-center md:p-8 -mt-10" : "mx-auto mb-6 w-full max-w-xl"}>
            
            {showScanIdle && (
              <>
                <div className="relative mb-6 h-24 w-24 md:h-32 md:w-32">
                  <div className="absolute inset-0 animate-[pulse_3s_cubic-bezier(0.4,0,0.6,1)_infinite] rounded-full bg-blue-50"></div>
                  <div className="absolute inset-2 flex items-center justify-center rounded-full border-2 border-dashed border-blue-200 bg-white">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="h-10 w-10 text-blue-500 md:h-12 md:w-12">
                      <path d="M256 0c-12.8 0-24.8 5.6-33 15L64 185l-44.5 13.9C7.8 202.5 0 212.8 0 224V448c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V224c0-11.2-7.8-21.5-19.5-25.1L448 185 289 15c-8.2-9.4-20.2-15-33-15zM64 220l41.6-13.1L256 31.5l150.4 175.4L448 220v36H64V220zm416 76H320v44c0 24.3-19.7 44-44 44H236c-24.3 0-44-19.7-44-44V296H64V448c0 8.8 7.2 16 16 16H432c8.8 0 16-7.2 16-16V296z"/>
                    </svg>
                  </div>
                </div>
                <h2 className="mb-8 text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
                  Skanowanie zwrotu
                </h2>
              </>
            )}

            <div className={`relative mx-auto w-full ${showScanIdle ? "max-w-md mb-8" : "w-full"}`}>
              <svg 
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400 h-5 w-5" 
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden
              >
                <path d="M4 7V5a1 1 0 0 1 1-1h2" />
                <path d="M4 17v2a1 1 0 0 0 1 1h2" />
                <path d="M16 4h2a1 1 0 0 1 1 1v2" />
                <path d="M16 20h2a1 1 0 0 0 1-1v-2" />
                <path d="M7 8v8" />
                <path d="M10 7v10" />
                <path d="M13 8v8" />
                <path d="M16 7v10" />
              </svg>
              <input
                id="wms-returns-scan-input"
                ref={searchInputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search();
                }}
                disabled={loading}
                placeholder="Zeskanuj list przewozowy"
                className={`w-full rounded-xl border-2 border-slate-200 bg-white text-sm font-semibold text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 ${
                  showScanIdle ? "h-14 pl-12 pr-4" : "h-11 pl-11 pr-4"
                }`}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {showScanIdle && (
              <button
                type="button"
                className="mx-auto flex h-12 w-full max-w-md items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-6 text-sm font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-500/10 active:bg-slate-100"
                onClick={() => searchInputRef.current?.focus()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="h-4 w-4 text-slate-400">
                  <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 456.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>
                </svg>
                Wpisz numer i naciśnij Enter
              </button>
            )}

            {err ? <p className="mt-3 text-center text-sm text-rose-600">{err}</p> : null}
            {!showScanIdle && orderLoadErr ? (
              <p className="mt-3 text-center text-sm text-rose-600">{orderLoadErr}</p>
            ) : null}
            {loading ? <p className="mt-3 text-center text-sm font-medium text-slate-500">Szukam…</p> : null}
          </div>

          {!showScanIdle && (
            <div className="mx-auto w-full max-w-5xl">
              {hits.length > 0 && !selectedOrder && (
                <ul className="mb-8 w-full space-y-2">
                  {hits.map((h, hi) => {
                    const sub = orderDocSubtitle(h.sales_document_number);
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          ref={hi === 0 ? firstHitButtonRef : undefined}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm outline-none transition hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#41546a]/35"
                          onClick={() =>
                            void loadOrderById(h.id, {
                              highlightReturnId:
                                h.matched_return_id != null && Number.isFinite(h.matched_return_id)
                                  ? h.matched_return_id
                                  : undefined,
                            })
                          }
                        >
                          <span className="text-base font-semibold text-slate-900">{h.number ?? `#${h.id}`}</span>
                          {sub ? <span className="truncate text-xs text-slate-500">{sub}</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {selectedOrder && (
                <div className="mb-8 w-full space-y-6">
                  <div className="flex w-full flex-col gap-4 rounded-xl border-2 border-slate-200/90 bg-white p-4 shadow-md sm:flex-row sm:items-center sm:gap-0">
                    <div className="flex shrink-0 flex-col text-left">
                      <div className="text-2xl font-bold tabular-nums text-slate-900">
                        #{selectedOrder.number ?? selectedOrder.id}
                      </div>
                      <div className="text-sm text-gray-500 tabular-nums">{orderTileDateLine}</div>
                    </div>

                    <div className="ml-0 flex min-w-0 flex-col space-y-1.5 text-left sm:ml-6">
                      <div
                        className={`text-lg font-semibold ${orderHeaderMissingCustomer ? "italic text-gray-400" : "text-slate-900"}`}
                      >
                        {orderHeaderCustomer}
                      </div>
                      {orderTileContact.login ? (
                        <div className="text-base text-gray-500">{orderTileContact.login}</div>
                      ) : null}
                      <div className="text-base text-gray-500">{orderHeaderSource}</div>
                    </div>

                    <div className="ml-0 flex min-w-0 flex-col space-y-1.5 text-left text-base font-medium sm:ml-10">
                      <span className="tabular-nums text-slate-800">{orderTileContact.phone ?? "—"}</span>
                      <span className="break-all text-slate-700">{orderTileContact.email ?? "—"}</span>
                    </div>

                    <div className="flex items-center sm:ml-auto">
                      <button
                        type="button"
                        disabled={listLoading}
                        className="h-12 w-full rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        onClick={openNewReturnForm}
                      >
                        + Nowy zwrot
                      </button>
                    </div>
                  </div>

                  <div>
                    <h2 className="mb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                      Zwroty / Reklamacje
                    </h2>

                    {orderReturnsErr && <p className="mb-2 text-sm text-rose-600">{orderReturnsErr}</p>}
                    {orderComplaintsErr && <p className="mb-2 text-sm text-rose-600">{orderComplaintsErr}</p>}
                    {listLoading && <p className="text-sm text-slate-500">Ładowanie…</p>}

                    {!listLoading && !orderReturnsErr && !orderComplaintsErr && !hasReturns && !hasComplaints && (
                      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-left text-sm text-slate-600">
                        Brak zwrotów i reklamacji — użyj „Nowy zwrot”, aby dodać RMZ.
                      </p>
                    )}

                    {(hasReturns || hasComplaints) ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtr kolejki zwroty i reklamacje">
                          {(
                            [
                              { key: "all" as const, label: "Wszystko" },
                              { key: "returns" as const, label: "Zwroty" },
                              { key: "complaints" as const, label: "Reklamacje" },
                            ] as const
                          ).map(({ key, label }) => {
                            const active = queueFilter === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                disabled={listLoading}
                                onClick={() => setQueueFilter(key)}
                                className={`rounded-full border px-4 py-1.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  active
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        
                        {!listLoading && !orderReturnsErr && !orderComplaintsErr && mergedQueueTiles.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/90 px-3 py-3 text-left text-sm text-amber-950">
                            Brak pozycji w wybranym filtrze — przełącz na „Wszystko”, „Zwroty” lub „Reklamacje”.
                          </p>
                        ) : null}
                        
                        {mergedQueueTiles.length > 0 ? (
                        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {mergedQueueTiles.map((entry, idx) => {
                            if (entry.kind === "return") {
                              const r = entry.ret;
                              const { label: statusLabel, badge } = rmzCardClasses(r.status);
                              const retDone = wmsReturnListItemIsCompleted(r);
                              const retRibbon = wmsReturnListRibbon(r);
                              const retContent = returnQueueCardContent(r, selectedOrder);
                              return (
                                <div
                                  key={`rmz-${r.id}`}
                                  className="min-h-0"
                                  ref={(el) => {
                                    rowRefs.current[r.id] = el;
                                  }}
                                >
                                  <WmsListCardTile
                                    variant="return"
                                    idLine={r.rmz_number}
                                    metaLines={retContent.metaLines}
                                    bodyLine={retContent.bodyLine}
                                    isCompleted={retDone}
                                    ribbon={retRibbon}
                                    statusLabel={statusLabel}
                                    statusBadgeClassName={badge}
                                    freshIncoming={wmsReturnShowsFreshIncomingBadge(r.status)}
                                    createdAtIso={r.created_at}
                                    onActivate={() => navigate(WMS_ROUTES.returnsProcess(r.id))}
                                    tileRef={idx === 0 ? firstQueueTileRef : undefined}
                                  />
                                </div>
                              );
                            }
                            const c = entry.cmp;
                            const st = complaintRowStatusPresentation(c.status);
                            const cmpDone = complaintListItemIsCompleted(c);
                            const cmpRibbon = complaintListRibbon(c);
                            const cmpContent = complaintQueueCardContent(c, selectedOrder);
                            return (
                              <div key={`cmp-${c.id}`} className="min-h-0">
                                <WmsListCardTile
                                  variant="complaint"
                                  idLine={`Reklamacja #${c.id}`}
                                  metaLines={cmpContent.metaLines}
                                  bodyLine={cmpContent.bodyLine}
                                  bodyExtra={cmpContent.bodyExtra}
                                  isCompleted={cmpDone}
                                  ribbon={cmpRibbon}
                                  statusLabel={st.label}
                                  statusBadgeClassName={st.badgeClass}
                                  createdAtIso={c.created_at}
                                  onActivate={() => {
                                    if (import.meta.env.DEV) {
                                      console.log("Open complaint", {
                                        complaintId: c.id,
                                        complaintNumber: c.reference_code,
                                        orderId: c.order_id,
                                      });
                                    }
                                    navigate(WMS_ROUTES.complaintsProcess(c.id));
                                  }}
                                  tileRef={idx === 0 ? firstQueueTileRef : undefined}
                                />
                              </div>
                            );
                          })}
                        </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Wyjeżdżający panel - "Nowy Zwrot" */}
      {showCreateForm && selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wms-return-panel-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
            aria-label="Zamknij panel"
            onClick={closeCreateFormPanel}
          />
          <aside
            ref={createFormSectionRef}
            className={`relative z-10 flex h-full w-full max-w-[400px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
              returnPanelEntered ? "translate-x-0" : "translate-x-full"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 id="wms-return-panel-title" className="text-base font-semibold text-slate-900">
                Nowy zwrot
              </h2>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Zamknij"
                onClick={closeCreateFormPanel}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (linesForCreate.length === 0 || submitting) return;
                void createReturn();
              }}
            >
              <p className="text-left text-sm leading-relaxed text-slate-600">
                Ustal ilości do zwrotu (nie więcej niż w zamówieniu). Po zapisie dokument RMZ pojawi się na liście obok.
              </p>
              <div>
                <label className="mb-1 block text-left text-xs font-semibold text-slate-600">
                  Rodzaj zwrotu
                </label>
                <select
                  value={newReturnType}
                  onChange={(e) => setNewReturnType(e.target.value as "RMA" | "UNCLAIMED")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="RMA">Zwrot</option>
                  <option value="UNCLAIMED">Nieodebrane</option>
                </select>
              </div>
              {createReturnErr ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                  {createReturnErr}
                </p>
              ) : null}
              <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                {selectedOrder.items.map((it, ii) => {
                  const p = it.product;
                  const imgRaw = (p.image_url || "").trim();
                  const imgSrc = imgRaw ? resolveDamageMediaUrl(imgRaw) : "";
                  const ean = (p.ean || "").trim();
                  const skuLine = ((p.sku || "").trim() || (p.symbol || "").trim()) || "";
                  const noOrderQty = it.quantity <= 0;
                  return (
                    <div
                      key={it.id}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 shadow-sm ${
                        noOrderQty
                          ? "cursor-not-allowed border-slate-200 bg-slate-100/80 opacity-60"
                          : "border-slate-100 bg-slate-50/80"
                      }`}
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200/80">
                        {imgSrc ? (
                          <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-400" aria-hidden>
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008H12V8.25Z"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="break-words text-sm font-bold leading-snug text-slate-900">{p.name ?? "—"}</div>
                        <div className="mt-0.5 text-sm text-slate-500">EAN: {ean || "—"}</div>
                        <div className="text-sm text-slate-500">SKU: {skuLine || "—"}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          W zamów.: <span className="tabular-nums font-medium text-slate-600">{it.quantity}</span>
                          {noOrderQty ? (
                            <span className="ml-1 font-semibold text-amber-800"> — brak w zamówieniu</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 self-center">
                        <span className="text-xs font-semibold text-slate-600">Do zwrotu</span>
                        <input
                          ref={ii === firstReturnQtyRowIndex ? firstQtyInputRef : undefined}
                          type="number"
                          min={0}
                          max={it.quantity}
                          value={qtyByItem[it.id] ?? 0}
                          onChange={(e) => setQty(it.id, Number(e.target.value), it.quantity)}
                          disabled={noOrderQty || submitting}
                          aria-disabled={noOrderQty || submitting}
                          title={noOrderQty ? "Pozycja z ilością 0 w zamówieniu — nie można zwrócić" : undefined}
                          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-2 text-center text-base tabular-nums text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="submit"
                disabled={linesForCreate.length === 0 || submitting}
                className="w-full shrink-0 rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Dodaj zwrot
              </button>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}