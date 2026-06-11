import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import axios from "axios";
import QRCode from "qrcode";

import { uploadDamageImageFile } from "../../api/damageUploadApi";
import { coercePhotoUrlForDamageEntry, createDamageEntry } from "../../api/damageReportsApi";
import { getReturnUiStatusSummary, patchReturnRmzUiStatus } from "../../api/returnUiStatusApi";
import {
  getWmsCustomerInsights,
  getWmsReturn,
  getWmsReturnsModeSettings,
  finalizeWmsReturn,
  processWmsReturnLine,
  processWmsReturnLineSplit,
} from "../../api/wmsReturnsApi";
import { getWmsReturnModuleConfig } from "../../api/returnModuleConfigApi";
import { useWmsScanner } from "../../context/WmsScannerContext";
import type { DamageCandidate } from "../../types/damageReport";
import type {
  CustomerInsightsRead,
  CustomerRiskTier,
  ReturnStatusBrief,
  ReturnUiMainGroup,
  ReturnUiStatusPanelSummary,
  WmsReturnLineDamageEntryPayload,
  WmsReturnLineDamageEntryRead,
  WmsReturnLineProcess,
  WmsReturnLineRead,
  WmsReturnRead,
  WmsSettingsRead,
} from "../../types/wmsReturn";
import type { WmsReturnModuleConfigDto } from "../../types/returnModuleConfig";
import { panelStatusRichPreviewStyle } from "../../utils/panelStatusColor";

type WmsReturnReadWithStatusAlias = WmsReturnRead & { return_status?: ReturnStatusBrief };

/** API may expose `status` or `return_status`; terminal workflows use `type` starting with `done`. */
function wmsReturnWorkflowTypeFromRead(ret: WmsReturnRead | null): string | undefined {
  if (!ret) return undefined;
  const r = ret as WmsReturnReadWithStatusAlias;
  const t = r.status?.type ?? r.return_status?.type;
  return t != null ? String(t) : undefined;
}

/** Backend source of truth when present; fallback to `status.type` for older responses. */
function wmsReturnWorkflowFinished(ret: WmsReturnRead | null): boolean {
  if (!ret) return false;
  if (typeof ret.workflow_finished === "boolean") return ret.workflow_finished;
  const t = wmsReturnWorkflowTypeFromRead(ret);
  return t != null && t.startsWith("done");
}

function normalizeLineDamagePhotoUrls(line: WmsReturnLineRead): string[] {
  const raw = line.photo_urls;
  if (!Array.isArray(raw)) return [];
  return raw.map((u) => String(u).trim()).filter(Boolean);
}

/**
 * Unikalny klucz karty / stanu per linia RMZ. Sam `order_item_id` nie wystarcza (wiele wierszy `rmz_lines`
 * lub ten sam SKU w dwóch liniach) — mutowałoby to ten sam wpis w `unitRowsByLineId` itd.
 */
function wmsReturnGridLineIdFromApiLine(line: WmsReturnLineRead, rowIndex: number): string {
  const rawId = line.id;
  if (rawId != null && Number.isFinite(Number(rawId)) && Number(rawId) > 0) {
    return `rmzl-${Math.floor(Number(rawId))}`;
  }
  return `ln-oi-${line.order_item_id}-r${rowIndex}`;
}

function customerInsightsRiskCardClass(tier: CustomerRiskTier): string {
  switch (tier) {
    case "normal":
      return "border border-green-200 bg-green-50 text-green-800";
    case "elevated":
      return "border border-amber-200 bg-amber-50 text-amber-950";
    case "high":
      return "border border-red-200 bg-red-50 text-red-900";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-800";
  }
}

function customerReturnPeekBadgeSurfaceClass(tier: CustomerRiskTier): string {
  switch (tier) {
    case "normal":
      return "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
    case "elevated":
      return "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100";
    case "high":
      return "border-red-300 bg-red-50 text-red-900 hover:bg-red-100";
    default:
      return "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100";
  }
}
import { WMS_ROUTES } from "../wms/wmsRoutes";
import api from "../../api/axios";
import { printReturnLabel } from "../../api/returnLabelPrintApi";
import { wmsPhotoUploadClient } from "../../api/wmsPhotoUploadClient";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { getPublicBaseUrl } from "../../config/publicUrl";
import { DAMAGE_TENANT_ID } from "./damageShared";
import {
  RMZ_DAMAGE_CLASS_B_TOOLTIP,
  RMZ_DAMAGE_CLASS_C_TOOLTIP,
  RmzDamageTypeChips,
  decodeRmzDamageTypePayload,
  encodeRmzDamageTypePayload,
  filterRmzDamageTypeIdsForClass,
  mergeRmzDamageTypePayloadFromUnits,
  rmzDamageTypesForClassResolved,
  type RmzDamageReasonRow,
  type RmzDamageTypeId,
} from "./rmzDamageTypes";
import { WMS_REJECT_OTHER_ID, wmsRejectReasonSelectOptions } from "./wmsRejectReasons";
import { RmzProcessLineSidebar } from "./rmzProcessLineSidebar";
import { resolveRmzLineSidebarStatus } from "./rmzLineSidebarStatus";

/** Max images per damage line (aligned with API). */
const MAX_DAMAGE_PHOTOS = 15;

/** Some browsers leave MIME empty (e.g. HEIC); fall back to extension. */
function isProbablyImageFile(f: File): boolean {
  if (f.type.startsWith("image/")) return true;
  const n = f.name.toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(n);
}

type DamagePhotoItem = { id: string; preview: string; name: string };
type PhoneUploadSessionState = {
  lineId: string;
  unitIndex: number;
  sessionId: string;
  qrDataUrl: string;
  seenUrls: string[];
};

/** Server-backed `/uploads/…` URLs only; never blob/data. */
function persistedUrlsFromDamageFiles(files: DamagePhotoItem[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const c = coercePhotoUrlForDamageEntry(f.preview);
    if (c) out.push(c);
  }
  return out;
}

function newDamagePhoto(preview: string, name: string): DamagePhotoItem {
  return { id: crypto.randomUUID(), preview, name };
}

const DAMAGE_SAVE_FALLBACK = "Nie udało się zapisać uszkodzenia";

/** Map FastAPI 422/400 `detail` (string | ValidationError[]) to a single message. */
function formatDamageSaveApiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data;
    const detail = typeof d === "object" && d !== null && "detail" in d ? (d as { detail: unknown }).detail : undefined;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (Array.isArray(detail)) {
      const parts = detail.map((row) => {
        if (typeof row === "object" && row !== null && "msg" in row) {
          const loc = "loc" in row && Array.isArray((row as { loc?: unknown }).loc)
            ? (row as { loc: (string | number)[] }).loc.join(".")
            : "";
          const msg = String((row as { msg: unknown }).msg);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(row);
      });
      const joined = parts.filter(Boolean).join(" ");
      if (joined) return joined;
    }
  }
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return DAMAGE_SAVE_FALLBACK;
}

/** Internal; UI shows only OK • Uszkodzony • Odrzucony. */

type LineDecision = "PENDING" | "OK" | "DAMAGED" | "REJECTED";

/** Grid „uszkodzony” — szkic lokalny do czasu zapisu lub jawnego anulowania. */
type GridDamageDraft = {
  damageClass: "B" | "C" | null;
  damageTypeIds: string[];
  photoUrls: string[];
  /** Zawsze 1 — jedna sztuka na zapis (powtórz flow dla kolejnych uszkodzeń). */
  damagedQty: number;
  note: string;
};

const EMPTY_GRID_DAMAGE_DRAFT: GridDamageDraft = {
  damageClass: null,
  damageTypeIds: [],
  photoUrls: [],
  damagedQty: 1,
  note: "",
};



export type ReturnLineModel = {

  lineId: string;

  /** `rmz_lines.id` for label print API */
  returnLineId?: number | null;

  candidate: DamageCandidate;

  systemStatus: LineDecision;

};



export type ReturnDocumentModel = {

  id: string;

  rmaNumber: string;

  lines: ReturnLineModel[];

};



type OrderItemRow = {
  id: number;
  quantity: number;
  unit_price?: number | null;
  list_price?: number | null;
  price?: number | null;
  product: { id: number; name?: string | null; sku?: string | null; ean?: string | null; image_url?: string | null };
};

type OrderDetailForReturn = {
  id: number;
  number?: string | null;
  /** Backend może dodać pole — wyświetlamy w nagłówku, jeśli jest. */
  customer_name?: string | null;
  billing_name?: string | null;
  recipient_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  items: OrderItemRow[];
  order_date?: string | null;
  created_at?: string | null;
  value?: number | null;
  shipping_method?: string | null;
  currency?: string | null;
  addresses_json?: string | null;
  delivery_price?: number | string | null;
  shipping_cost?: number | string | null;
  total_price?: number | string | null;
};

function toNonNegMoney(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(typeof v === "string" ? String(v).replace(",", ".").trim() : v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/**
 * Koszt dostawy do zwrotu: delivery_price || shipping_cost, z limitem względem total_price/value.
 */
function resolveOrderShippingCostForRefund(order: OrderDetailForReturn | null | undefined): {
  amount: number;
  displayMissing: boolean;
} {
  if (!order) return { amount: 0, displayMissing: true };
  const d = toNonNegMoney(order.delivery_price);
  const s = toNonNegMoney(order.shipping_cost);
  let shippingCost = d || s || 0;
  const totalPrice = toNonNegMoney(order.total_price) || toNonNegMoney(order.value);
  if (totalPrice > 0 && shippingCost > totalPrice) {
    shippingCost = 0;
  }
  const displayMissing = d === 0 && s === 0;
  return { amount: shippingCost, displayMissing };
}

/** Pełny zwrot: suma sztuk na zwrocie === suma sztuk w zamówieniu. */
function computeIsWmsFullReturn(orderQtySum: number, returnedQtySum: number): boolean {
  return orderQtySum > 0 && returnedQtySum === orderQtySum;
}

function pickAddrStr(obj: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

/** Best-effort: shipping then billing (aligned with backend WMS helpers). */
function customerFromAddressesJson(raw: string | null | undefined): {
  name: string;
  phone: string | null;
  email: string | null;
} {
  if (!raw?.trim()) return { name: "", phone: null, email: null };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { name: "", phone: null, email: null };
  }
  const shipping =
    data.shipping && typeof data.shipping === "object" ? (data.shipping as Record<string, unknown>) : {};
  const billing =
    data.billing && typeof data.billing === "object" ? (data.billing as Record<string, unknown>) : {};
  const nameFrom = (b: Record<string, unknown>) => {
    const fn = pickAddrStr(b, ["Imię", "first_name"]);
    const ln = pickAddrStr(b, ["Nazwisko", "last_name"]);
    if (fn || ln) return [fn, ln].filter(Boolean).join(" ");
    return (
      pickAddrStr(b, ["full_name", "name"]) ||
      pickAddrStr(b, ["company", "Firma", "company_name"]) ||
      ""
    );
  };
  const name = nameFrom(shipping) || nameFrom(billing);
  const phone =
    pickAddrStr(shipping, ["Telefon", "phone", "mobile", "tel"]) ||
    pickAddrStr(billing, ["Telefon", "phone", "mobile", "tel"]) ||
    pickAddrStr(data, ["phone", "phone_number", "tel"]);
  const email =
    pickAddrStr(shipping, ["Email", "email"]) ||
    pickAddrStr(billing, ["Email", "email"]) ||
    pickAddrStr(data, ["email"]);
  return { name: name || "", phone, email };
}

function formatOrderDetailDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoneyAmount(v: number, currency: string | null | undefined): string {
  const u = currency?.trim() || "PLN";
  return `${(Number.isFinite(v) ? v : 0).toFixed(2)} ${u}`;
}

/** Operational card chrome: neutral default, green OK, orange damaged, red rejected. */

function cardChrome(status: LineDecision): {
  cardClass: string;
  statusLabel: string;
  badgeClass: string;
} {
  switch (status) {
    case "OK":
      return {
        cardClass: "rounded-2xl border border-slate-200 bg-white shadow-sm",
        statusLabel: "OK",
        badgeClass: "bg-[#41546a] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white",
      };
    case "DAMAGED":
      return {
        cardClass: "rounded-2xl border border-slate-200 bg-white shadow-sm",
        statusLabel: "USZKODZONY",
        badgeClass: "bg-amber-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white",
      };
    case "REJECTED":
      return {
        cardClass: "rounded-2xl border border-slate-200 bg-white shadow-sm",
        statusLabel: "ODRZUCONY",
        badgeClass: "bg-rose-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white",
      };
    default:
      return {
        cardClass: "rounded-2xl border border-slate-200 bg-white shadow-sm",
        statusLabel: "OCZEKUJE",
        badgeClass: "bg-slate-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white",
      };
  }
}



type LineOverride = {
  systemStatus?: LineDecision;
  rejectReasonId?: string | null;
  rejectReasonOtherText?: string | null;
};
type UnitDecision = {
  decision: "ACCEPTED" | "DAMAGED" | "REJECTED" | null;
  damageClass: "B" | "C";
  photoUrls: string[];
  damageTypeIds: string[];
  /** Id wpisu `damage_entries_json` — każda uszkodzona sztuka = osobny UUID (nie współdziel metadata). */
  damageEntryId: string | null;
  /** Notatka operacyjna tylko dla tej sztuki (payload `damage_entries[].note`). */
  damageNote?: string | null;
  /** Operator przypisany do pojedynczej sztuki uszkodzonej. */
  damageOperator?: string | null;
  /** Timestamp wpisu pojedynczej sztuki uszkodzonej (ISO). */
  damageCreatedAt?: string | null;
};

/** Jedna linia seedu RMZ — spójny typ z `lineSeeds` w `WmsReturnsPage`. */
export type LineSeedRecord = {
  lineId: string;
  orderItemId: number;
  rmzLineId?: number | null;
  candidate: DamageCandidate;
  initialDecision: LineDecision;
  unitPrice: number;
  ean?: string;
  sku?: string;
  acceptedQty?: number | null;
  damagedQty?: number | null;
  damagedBQty?: number | null;
  damagedCQty?: number | null;
  rejectedQty?: number | null;
  damageTypeSnapshot?: string | null;
  damagePhotoUrls?: string[];
  /** Z API: niezależne wpisy uszkodzeń (priorytet przy budowaniu siatki). */
  damageEntries?: WmsReturnLineDamageEntryRead[] | null;
};

/** Buduje wiersze jednostek z seedu (ta sama logika co `useEffect` na `lineSeeds`). */
export function buildUnitRowsForLineSeed(s: LineSeedRecord, reasonRows?: RmzDamageReasonRow[] | null): UnitDecision[] {
  const total = Math.max(0, Math.floor(s.candidate.availableQuantity));
  const isPending = s.initialDecision === "PENDING";
  const safeQty = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };
  const apiResolved =
    safeQty(s.acceptedQty) + safeQty(s.damagedBQty) + safeQty(s.damagedCQty) + safeQty(s.rejectedQty);
  /** Rozstrzygnięta linia (OK/DMG/REJ) albo częściowy zapis RMZ z ilościami przy decision=null. */
  const hasExisting = !isPending || apiResolved > 0;
  const acceptedRaw = Number(s.acceptedQty ?? total);
  const damagedRaw = Number(s.damagedQty ?? 0);
  const damagedBRaw = Number(s.damagedBQty ?? 0);
  const damagedCRaw = Number(s.damagedCQty ?? 0);
  const rejectedRaw = Number(s.rejectedQty ?? 0);
  const accepted = hasExisting ? Math.max(0, Math.floor(acceptedRaw)) : 0;
  const damagedB = hasExisting ? Math.max(0, Math.floor(damagedBRaw)) : 0;
  const damagedC = hasExisting ? Math.max(0, Math.floor(damagedCRaw)) : 0;
  const damaged = hasExisting ? Math.max(0, Math.floor(damagedRaw)) : 0;
  const rejected = hasExisting ? Math.max(0, Math.floor(rejectedRaw)) : 0;
  const damagedUnits = Math.max(damaged, damagedB + damagedC);
  /** API często zwraca `decision=OK` bez accepted_qty — inaczej jednostki zostają „null” i UI wygląda na nierozstrzygnięte. */
  let acceptedUnits = accepted;
  if (!isPending && s.initialDecision === "OK" && total > 0) {
    const accounted = acceptedUnits + damagedUnits + rejected;
    if (accounted < total) {
      acceptedUnits = Math.max(0, total - damagedUnits - rejected);
    }
  }
  const entriesFromApi = s.damageEntries;
  if (entriesFromApi && entriesFromApi.length > 0 && hasExisting) {
    const units: UnitDecision[] = [];
    const empty = (): UnitDecision => ({
      decision: null,
      damageClass: "B",
      photoUrls: [],
      damageTypeIds: [],
      damageEntryId: null,
      damageNote: null,
      damageOperator: null,
      damageCreatedAt: null,
    });
    for (let i = 0; i < acceptedUnits; i += 1) {
      units.push({
        decision: "ACCEPTED",
        damageClass: "B",
        photoUrls: [],
        damageTypeIds: [],
        damageEntryId: null,
        damageNote: null,
        damageOperator: null,
        damageCreatedAt: null,
      });
    }
    for (let i = 0; i < rejected; i += 1) {
      units.push({
        decision: "REJECTED",
        damageClass: "B",
        photoUrls: [],
        damageTypeIds: [],
        damageEntryId: null,
        damageNote: null,
        damageOperator: null,
        damageCreatedAt: null,
      });
    }
    for (const ent of entriesFromApi) {
      const cond = ent.condition === "C" ? "C" : "B";
      const snapDecoded = decodeRmzDamageTypePayload(ent.damage_type ?? null, reasonRows);
      const typesForClass = filterRmzDamageTypeIdsForClass(cond, snapDecoded, reasonRows);
      const pics = Array.isArray(ent.photo_urls)
        ? ent.photo_urls.map((u) => String(u).trim()).filter(Boolean)
        : [];
      const baseId = String(ent.id ?? "").trim() || crypto.randomUUID();
      const q = Math.max(0, Math.floor(ent.qty ?? 0));
      const entNote = ent.note != null && String(ent.note).trim() ? String(ent.note).trim() : null;
      const entOperator =
        ent.operator_name != null && String(ent.operator_name).trim() ? String(ent.operator_name).trim() : null;
      const entCreatedAt =
        ent.created_at != null && String(ent.created_at).trim() ? String(ent.created_at).trim() : null;
      for (let k = 0; k < q; k += 1) {
        units.push({
          decision: "DAMAGED",
          damageClass: cond,
          photoUrls: [...pics],
          damageTypeIds: [...typesForClass],
          damageEntryId: q <= 1 ? baseId : `${baseId}-u${k + 1}`,
          damageNote: entNote,
          damageOperator: entOperator,
          damageCreatedAt: entCreatedAt,
        });
      }
    }
    while (units.length < total) units.push(empty());
    return units.slice(0, total);
  }

  const snapDecoded = decodeRmzDamageTypePayload(s.damageTypeSnapshot, reasonRows);
  const typesForB = filterRmzDamageTypeIdsForClass("B", snapDecoded, reasonRows);
  const typesForC = filterRmzDamageTypeIdsForClass("C", snapDecoded, reasonRows);
  const linePhotos = s.damagePhotoUrls ?? [];
  const legacyBId = s.rmzLineId != null ? `legacy-b-${s.rmzLineId}` : "legacy-b";
  const legacyCId = s.rmzLineId != null ? `legacy-c-${s.rmzLineId}` : "legacy-c";
  const units: UnitDecision[] = [];
  for (let i = 0; i < acceptedUnits; i += 1) {
    units.push({
      decision: "ACCEPTED",
      damageClass: "B",
      photoUrls: [],
      damageTypeIds: [],
      damageEntryId: null,
      damageNote: null,
      damageOperator: null,
      damageCreatedAt: null,
    });
  }
  for (let i = 0; i < rejected; i += 1) {
    units.push({
      decision: "REJECTED",
      damageClass: "B",
      photoUrls: [],
      damageTypeIds: [],
      damageEntryId: null,
      damageNote: null,
      damageOperator: null,
      damageCreatedAt: null,
    });
  }
  for (let i = 0; i < Math.min(damagedB, damagedUnits); i += 1) {
    units.push({
      decision: "DAMAGED",
      damageClass: "B",
      photoUrls: [...linePhotos],
      damageTypeIds: [...typesForB],
      damageEntryId: `${legacyBId}-${i}`,
      damageNote: null,
      damageOperator: null,
      damageCreatedAt: null,
    });
  }
  for (let i = 0; i < Math.min(damagedC, Math.max(0, damagedUnits - damagedB)); i += 1) {
    units.push({
      decision: "DAMAGED",
      damageClass: "C",
      photoUrls: [...linePhotos],
      damageTypeIds: [...typesForC],
      damageEntryId: `${legacyCId}-${i}`,
      damageNote: null,
      damageOperator: null,
      damageCreatedAt: null,
    });
  }
  while (units.filter((u) => u.decision === "DAMAGED").length < damagedUnits) {
    units.push({
      decision: "DAMAGED",
      damageClass: "B",
      photoUrls: [...linePhotos],
      damageTypeIds: [...typesForB],
      damageEntryId: crypto.randomUUID(),
      damageNote: null,
      damageOperator: null,
      damageCreatedAt: null,
    });
  }
  while (units.length < total)
    units.push({
      decision: null,
      damageClass: "B",
      photoUrls: [],
      damageTypeIds: [],
      damageEntryId: null,
      damageNote: null,
      damageOperator: null,
      damageCreatedAt: null,
    });
  return units.slice(0, total);
}

/** Jedna pozycja `damage_entries_json` na każdą uszkodzoną sztukę (`qty` zawsze 1). */
export function buildDamageEntriesForSplitPayload(
  slice: UnitDecision[],
  dmgReasons: RmzDamageReasonRow[] | undefined,
): WmsReturnLineDamageEntryPayload[] {
  const out: WmsReturnLineDamageEntryPayload[] = [];
  slice.forEach((r) => {
    if (r.decision !== "DAMAGED") return;
    const id = r.damageEntryId?.trim() || crypto.randomUUID();
    const noteRaw = r.damageNote != null ? String(r.damageNote).trim() : "";
    const operatorRaw = r.damageOperator != null ? String(r.damageOperator).trim() : "";
    const createdAtRaw = r.damageCreatedAt != null ? String(r.damageCreatedAt).trim() : "";
    out.push({
      id,
      qty: 1,
      condition: r.damageClass,
      damage_type: encodeRmzDamageTypePayload(r.damageTypeIds, dmgReasons) || null,
      photo_urls: [...r.photoUrls],
      note: noteRaw || null,
      operator_name: operatorRaw || null,
      created_at: createdAtRaw || null,
    });
  });
  return out;
}

function damageEntryReasonSummary(
  encoded: string | null | undefined,
  dmgReasons: RmzDamageReasonRow[] | undefined,
): string {
  const ids = decodeRmzDamageTypePayload(encoded, dmgReasons);
  if (!ids.length) return "";
  return ids
    .map((id) => dmgReasons?.find((r) => r.code === id)?.label ?? id)
    .filter(Boolean)
    .join(", ");
}

function resolveDamageOperatorNameFallback(createdBy: string): string | null {
  const direct = createdBy.trim();
  if (direct) return direct;
  try {
    const keys = ["user_full_name", "user_name", "operator_name", "full_name"];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && v.trim()) return v.trim();
    }
  } catch {
    // ignore localStorage read failures
  }
  return null;
}

function unitRowsResolvedTotals(rows: UnitDecision[], total: number) {
  const slice = rows.slice(0, Math.max(0, total));
  let accepted = 0;
  let damagedB = 0;
  let damagedC = 0;
  let rejected = 0;
  for (const r of slice) {
    if (r.decision === "ACCEPTED") accepted += 1;
    else if (r.decision === "DAMAGED") {
      if (r.damageClass === "C") damagedC += 1;
      else damagedB += 1;
    } else if (r.decision === "REJECTED") rejected += 1;
  }
  return { accepted, damagedB, damagedC, rejected, damaged: damagedB + damagedC };
}

/** Zachowaj lokalne przypisanie jednostek, jeśli zgadza się z sumami z API (np. po częściowym zapisie). */
function unitRowsQuantitiesMatchSeed(rows: UnitDecision[], seed: LineSeedRecord): boolean {
  const total = Math.max(0, Math.floor(seed.candidate.availableQuantity));
  if (!rows.length || rows.length !== total) return false;
  const safeQty = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };
  const u = unitRowsResolvedTotals(rows, total);
  return (
    u.accepted === safeQty(seed.acceptedQty) &&
    u.damagedB === safeQty(seed.damagedBQty) &&
    u.damagedC === safeQty(seed.damagedCQty) &&
    u.rejected === safeQty(seed.rejectedQty)
  );
}

function encodeRejectReasonForSplitPayload(reasonId: string, otherText?: string | null): string {
  const rid = reasonId.trim();
  if (!rid) return "";
  if (rid === WMS_REJECT_OTHER_ID) {
    const note = String(otherText ?? "").trim();
    return note ? `${rid}|notatka:${note.slice(0, 300)}` : rid;
  }
  return rid;
}

/** Spójne z `setFirstNNullUnitsDecision` — użyj wyniku do `saveSplitForLine(..., rows, ...)` żeby uniknąć zamknięcia na przestarzałe `unitRowsByLineId`. */
function applyFirstNNullUnitsDecisionToRows(
  rowsIn: UnitDecision[],
  decision: "ACCEPTED" | "DAMAGED" | "REJECTED",
  n: number,
  patch?: Partial<UnitDecision>,
): UnitDecision[] {
  const rows = [...rowsIn];
  let left = Math.max(0, Math.floor(n));
  for (let i = 0; i < rows.length && left > 0; i += 1) {
    if (rows[i]!.decision != null) continue;
    rows[i] = {
      ...rows[i]!,
      decision,
      damageClass: (patch?.damageClass as "B" | "C" | undefined) ?? rows[i]!.damageClass,
      photoUrls: decision === "DAMAGED" ? [...(patch?.photoUrls ?? rows[i]!.photoUrls)] : [],
      damageTypeIds: decision === "DAMAGED" ? [...(patch?.damageTypeIds ?? rows[i]!.damageTypeIds)] : [],
      damageEntryId: decision === "DAMAGED" ? crypto.randomUUID() : null,
      damageNote:
        decision === "DAMAGED"
          ? (patch?.damageNote !== undefined ? patch.damageNote : rows[i]!.damageNote ?? null)
          : null,
    };
    left -= 1;
  }
  return rows;
}

const PANEL_UI_GROUP_LABELS: Record<ReturnUiMainGroup, string> = {
  NEW: "Nowe zwroty",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

function parseOrderItemUnitPrice(item: OrderItemRow): number {
  const candidates = [item.unit_price, item.list_price, item.price];
  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return 0;
}

type OrderDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  headerOrderDisplay: string;
  orderDetailCached: OrderDetailForReturn | null;
  gridLoading: boolean;
  orderSourceFallback: string;
  customerDisplayFallback: string;
  headerPhone: string | null;
  headerEmail: string | null;
};

function OrderDetailsModal({
  open,
  onClose,
  headerOrderDisplay,
  orderDetailCached,
  gridLoading,
  orderSourceFallback,
  customerDisplayFallback,
  headerPhone,
  headerEmail,
}: OrderDetailsModalProps) {
  if (!open) return null;

  const od = orderDetailCached;
  const currency = od?.currency ?? undefined;
  const items = od?.items ?? [];
  const productsTotal = items.reduce(
    (s, it) => s + Math.max(0, Number(it.quantity) || 0) * parseOrderItemUnitPrice(it),
    0,
  );
  const shipMeta = resolveOrderShippingCostForRefund(od ?? undefined);
  const shippingCost = shipMeta.amount;
  const orderValueFromDb = od?.value != null && Number.isFinite(Number(od.value)) ? Number(od.value) : null;
  const computedGrand = productsTotal + shippingCost;

  const addr = od ? customerFromAddressesJson(od.addresses_json) : { name: "", phone: null, email: null };
  const nameFromOd =
    [od?.first_name, od?.last_name].filter((x) => x != null && String(x).trim() !== "").join(" ").trim() || null;
  const legacyName = [od?.customer_name, od?.billing_name, od?.recipient_name].find(
    (x) => x != null && String(x).trim() !== "",
  );
  const customerName =
    addr.name ||
    nameFromOd ||
    (legacyName != null ? String(legacyName).trim() : "") ||
    customerDisplayFallback ||
    "—";
  const customerPhone = addr.phone || headerPhone || "—";
  const customerEmail = addr.email || headerEmail || "—";

  const sourceLine = (od?.source || orderSourceFallback || "—").trim() || "—";
  const orderDateLine = formatOrderDetailDate(od?.order_date ?? od?.created_at ?? null);
  const shipMethod = (od?.shipping_method && String(od.shipping_method).trim()) || "—";

  const totalOrderDisplay = orderValueFromDb ?? computedGrand;

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wms-order-details-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-[700px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="wms-order-details-title" className="text-lg font-bold text-slate-900">
              Zamówienie {headerOrderDisplay}
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-800">Źródło:</span> {sourceLine}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-semibold text-slate-800">Data zamówienia:</span>{" "}
              {!od && gridLoading ? "Ładowanie…" : orderDateLine}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="font-semibold text-slate-800">Sposób dostawy:</span> {od ? shipMethod : gridLoading ? "…" : "—"}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Zamknij"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {!od && gridLoading ? (
            <p className="text-sm text-slate-600">Wczytywanie szczegółów zamówienia…</p>
          ) : !od ? (
            <p className="text-sm font-medium text-rose-700">Brak danych zamówienia. Odśwież stronę lub sprawdź połączenie.</p>
          ) : (
            <>
              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Klient</h3>
                <div className="space-y-2 text-sm leading-relaxed text-slate-800">
                  <p>
                    <span className="font-semibold text-slate-600">Nazwa:</span> {customerName}
                  </p>
                  <p className="tabular-nums">
                    <span className="font-semibold text-slate-600">Telefon:</span> {customerPhone}
                  </p>
                  <p className="break-all">
                    <span className="font-semibold text-slate-600">Email:</span> {customerEmail}
                  </p>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Produkty</h3>
                <ul className="flex flex-col gap-3">
                  {items.map((it) => {
                    const p = it.product;
                    const unit = parseOrderItemUnitPrice(it);
                    const qty = Math.max(0, Number(it.quantity) || 0);
                    const lineTotal = unit * qty;
                    const img = p?.image_url?.trim();
                    return (
                      <li key={it.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/90 p-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
                          {img ? (
                            <img src={resolveDamageMediaUrl(img)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-slate-400">—</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900">{p?.name ?? `Produkt #${p?.id ?? ""}`}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">Ilość:</span>{" "}
                            <span className="tabular-nums text-slate-900">{qty}</span>
                            {" · "}
                            <span className="font-semibold text-slate-700">Cena:</span>{" "}
                            <span className="tabular-nums text-slate-900">{formatMoneyAmount(unit, currency)}</span>
                            {" · "}
                            <span className="font-semibold text-slate-700">Razem:</span>{" "}
                            <span className="tabular-nums text-slate-900">{formatMoneyAmount(lineTotal, currency)}</span>
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Podsumowanie</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-600">Suma produktów</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {formatMoneyAmount(productsTotal, currency)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-600">Koszt dostawy</dt>
                    <dd className={`font-semibold ${shipMeta.displayMissing ? "text-slate-500" : "tabular-nums text-slate-900"}`}>
                      {shipMeta.displayMissing ? "Brak kosztu dostawy" : formatMoneyAmount(shippingCost, currency)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                    <dt className="font-bold text-slate-800">Wartość zamówienia</dt>
                    <dd className="font-bold tabular-nums text-slate-900">
                      {formatMoneyAmount(totalOrderDisplay, currency)}
                    </dd>
                  </div>
                </dl>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function moneyPln(v: number): string {
  return `${(Number.isFinite(v) ? v : 0).toFixed(2)} zł`;
}

export type WmsReturnsPageProps = {
  embeddedReturnId?: number;
  initialReturn?: WmsReturnRead | null;
  embeddedOrderId?: number;
};

export default function WmsReturnsPage({
  embeddedReturnId,
  initialReturn = null,
  embeddedOrderId,
}: WmsReturnsPageProps = {}) {
  const { returnId } = useParams<{ returnId: string }>();
  const navigate = useNavigate();
  const rid = embeddedReturnId ?? Number(returnId);

  const [wmsReturn, setWmsReturn] = useState<WmsReturnRead | null>(
    initialReturn != null && embeddedReturnId != null && initialReturn.id === embeddedReturnId ? initialReturn : null,
  );
  const [sessionLoading, setSessionLoading] = useState(
    !(initialReturn != null && embeddedReturnId != null && initialReturn.id === embeddedReturnId),
  );
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [sessionRetryKey, setSessionRetryKey] = useState(0);
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [customerDisplay, setCustomerDisplay] = useState<string>("—");
  /** Pełna odpowiedź `GET orders/:id/` — bez dodatkowego requestu przy modalu szczegółów. */
  const [orderDetailCached, setOrderDetailCached] = useState<OrderDetailForReturn | null>(null);
  const [orderDetailsModalOpen, setOrderDetailsModalOpen] = useState(false);
  const [wmsSettings, setWmsSettings] = useState<WmsSettingsRead | null>(null);

  /** Return = order lines only; locations are chosen when recording damage (not here). */
  const [lineSeeds, setLineSeeds] = useState<LineSeedRecord[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [damageSaveError, setDamageSaveError] = useState<string | null>(null);
  /** Krótki komunikat po natychmiastowym zapisie decyzji „Przyjęty” (bez globalnego Zapisz). */
  const [inlineSaveToast, setInlineSaveToast] = useState<string | null>(null);
  const [damageSaving, setDamageSaving] = useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);

  const { registerScanHandler, setActiveDocument, showScannerToast } = useWmsScanner();
  useEffect(() => {
    if (!Number.isFinite(rid) || rid < 1) return;
    setActiveDocument({ kind: "custom", label: `RMZ #${rid}` });
    registerScanHandler((code) => {
      showScannerToast(`Skan ${code} — obsługa RMZ w przygotowaniu.`);
    });
    return () => {
      registerScanHandler(null);
      setActiveDocument(null);
    };
  }, [rid, registerScanHandler, setActiveDocument, showScannerToast]);

  const [lineOverrides, setLineOverrides] = useState<Record<string, LineOverride>>({});
  const [savingSplitByLineId, setSavingSplitByLineId] = useState<Record<string, boolean>>({});
  const [unitRowsByLineId, setUnitRowsByLineId] = useState<Record<string, UnitDecision[]>>({});
  const [uploadingLinePhotoById, setUploadingLinePhotoById] = useState<Record<string, boolean>>({});
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [leftViewMode, setLeftViewMode] = useState<"grid" | "detail">("grid");
  const [gridDamagedOpenByLineId, setGridDamagedOpenByLineId] = useState<Record<string, boolean>>({});
  /** Inline (bez modala): wybrana liczba sztuk dla następnego kroku przyjmij/uszkodzenie/odrzut. */
  const [gridQtyPickDraftByLineId, setGridQtyPickDraftByLineId] = useState<Record<string, number>>({});
  /** Ile sztuk objąć odrzuceniem po kroku wyboru ilości (inline). */
  const [pendingRejectBatchByLineId, setPendingRejectBatchByLineId] = useState<Record<string, number>>({});
  type GridLineMode = "idle" | "damaged" | "reject" | "pick_accept" | "pick_reject_qty" | "pick_damage_qty";
  const [gridLineModeByLineId, setGridLineModeByLineId] = useState<Record<string, GridLineMode>>({});
  const gridDamagedFlowRef = useRef({
    mode: {} as Record<string, GridLineMode>,
    open: {} as Record<string, boolean>,
  });
  useEffect(() => {
    gridDamagedFlowRef.current = { mode: gridLineModeByLineId, open: gridDamagedOpenByLineId };
  }, [gridLineModeByLineId, gridDamagedOpenByLineId]);
  /** Uszkodzenie w gridzie — jeden szkic na linię (nie ginie przy przełączaniu decyzji). */
  const [gridDamageDraftByLineId, setGridDamageDraftByLineId] = useState<Record<string, GridDamageDraft>>({});
  const gridDamageDraftRef = useRef(gridDamageDraftByLineId);
  gridDamageDraftRef.current = gridDamageDraftByLineId;
  const [gridRejectDraftByLineId, setGridRejectDraftByLineId] = useState<Record<string, string>>({});
  const [gridRejectOtherDraftByLineId, setGridRejectOtherDraftByLineId] = useState<Record<string, string>>({});
  /** Umożliwia `beginGridDecision` wywołanie zapisu przed deklaracją `saveSplitForLine` (kolejność hooków). */
  type SaveSplitForLineOpts = {
    hydrateReturn?: boolean;
    commitWorkflow?: boolean;
    /** Pełna linia REJECTED — powód dla `POST …/process` (unikamy czytania przestarzałego `lineOverrides`). */
    fullLineRejectReason?: { reasonId: string; otherText?: string | null };
    /** Split z odrzuconymi sztukami (linia mieszana / częściowa) — powód zapisywany w polu `damage_type` RMZ. */
    rejectReasonForSplit?: { reasonId: string; otherText?: string | null };
  };
  const saveSplitForLineRef = useRef<
    (lineId: string, rowsOverride?: UnitDecision[] | null, opts?: SaveSplitForLineOpts) => Promise<boolean>
  >(() => Promise.resolve(false));
  const confirmPickAcceptSaveRef = useRef<
    (lineId: string, pickCountOverride?: number) => Promise<void>
  >(() => Promise.resolve());

  /** Po „EDYTUJ” na zapisanej karcie — odblokowuje przyciski decyzji do ponownej edycji (wymaga ponownego Zapisz). */
  const [gridUnlockEditByLineId, setGridUnlockEditByLineId] = useState<Record<string, boolean>>({});
  const [dirtyLineIds, setDirtyLineIds] = useState<Record<string, true>>({});
  const [saveChangesLoading, setSaveChangesLoading] = useState(false);
  const [refundAmountByLineId, setRefundAmountByLineId] = useState<Record<string, number>>({});
  const [highlightCardLineId, setHighlightCardLineId] = useState<string | null>(null);
  const [hideResolvedProducts, setHideResolvedProducts] = useState(false);
  const [phoneUploadSession, setPhoneUploadSession] = useState<PhoneUploadSessionState | null>(null);
  const [sellasistCallModalOpen, setSellasistCallModalOpen] = useState(false);
  const [correspondenceModalOpen, setCorrespondenceModalOpen] = useState(false);
  const [correspondenceTab, setCorrespondenceTab] = useState<"allegro" | "email" | "notes">("allegro");
  const [correspondenceNotesDraft, setCorrespondenceNotesDraft] = useState("");
  const [correspondenceNotesFlash, setCorrespondenceNotesFlash] = useState(false);
  const [customerInsightsModalOpen, setCustomerInsightsModalOpen] = useState(false);
  const [customerInsightsLoading, setCustomerInsightsLoading] = useState(false);
  const [customerInsightsError, setCustomerInsightsError] = useState<string | null>(null);
  const [customerInsightsData, setCustomerInsightsData] = useState<CustomerInsightsRead | null>(null);
  /** Podgląd przy nazwie klienta (bez otwierania modala). */
  const [customerInsightsPeek, setCustomerInsightsPeek] = useState<CustomerInsightsRead | null>(null);
  const [customerInsightsPeekLoading, setCustomerInsightsPeekLoading] = useState(false);

  const damageLineRef = useRef<ReturnLineModel | null>(null);

  const [damageLine, setDamageLine] = useState<ReturnLineModel | null>(null);
  damageLineRef.current = damageLine;

  const [damageMassMode, setDamageMassMode] = useState(false);

  const [damageQuantity, setDamageQuantity] = useState(1);

  const [damageFiles, setDamageFiles] = useState<DamagePhotoItem[]>([]);
  const damageFilesRef = useRef<DamagePhotoItem[]>([]);
  damageFilesRef.current = damageFiles;

  /** Modal uszkodzenia — typy uszkodzeń (wielokrotny wybór), po klasie B/C. */
  const [damageModalTypeIds, setDamageModalTypeIds] = useState<string[]>([]);

  /** Modal uszkodzenia — tylko B / C (nigdy A w przepływie uszkodzenia). */
  const [damageConditionChoice, setDamageConditionChoice] = useState<"B" | "C" | null>(null);

  const [refundShipping, setRefundShipping] = useState<boolean>(false);
  const [refundShippingAmount, setRefundShippingAmount] = useState<number>(0);
  const [panelUiSummary, setPanelUiSummary] = useState<ReturnUiStatusPanelSummary | null>(null);
  const [panelUiStatusesError, setPanelUiStatusesError] = useState<string | null>(null);
  const [pendingPanelUiSubStatusId, setPendingPanelUiSubStatusId] = useState<number | "">("");
  const [panelUiStatusSaving, setPanelUiStatusSaving] = useState(false);
  const [shippingPartialConfirmOpen, setShippingPartialConfirmOpen] = useState(false);
  const prevIsFullReturnRef = useRef<boolean | null>(null);
  const shippingRefundInitForReturnIdRef = useRef<number | null>(null);

  const [createdBy, setCreatedBy] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  /** When set, line-unit draft owns the live camera preview (`videoRef`) — grid card uses unit `0`. */
  const [gridCameraLineId, setGridCameraLineId] = useState<string | null>(null);
  const [gridCameraUnitIndex, setGridCameraUnitIndex] = useState<number | null>(null);
  const [gridCardMenuLineId, setGridCardMenuLineId] = useState<string | null>(null);
  const [printLabelToast, setPrintLabelToast] = useState<string | null>(null);

  /** Canonical DB id from loaded RMZ — use for all POSTs (route param should match after load). */
  const selectedReturnDbId = useMemo(() => {
    const id = wmsReturn?.id;
    return id != null && Number.isFinite(Number(id)) && Number(id) > 0 ? Math.floor(Number(id)) : null;
  }, [wmsReturn?.id]);

  const returnWorkflowType = wmsReturnWorkflowTypeFromRead(wmsReturn);
  const isFinished = wmsReturnWorkflowFinished(wmsReturn);
  const returnHeaderBadgeLabel = useMemo(() => {
    const us = wmsReturn?.ui_status;
    if (us?.name?.trim()) return us.name.trim();
    if (us?.main_group) return PANEL_UI_GROUP_LABELS[us.main_group];
    return isFinished ? "Zakończone" : "W toku";
  }, [isFinished, wmsReturn?.ui_status]);
  const returnHeaderBadgeClass =
    !isFinished
      ? "bg-yellow-100 text-yellow-800"
      : returnWorkflowType === "done_rejected"
        ? "bg-rose-100 text-rose-900"
        : "bg-green-100 text-green-800";

  /** Normalized `/uploads/…` paths; updated synchronously inside setDamageFiles (avoids empty merge before React commits). */
  const damageEvidenceUrlsRef = useRef<string[]>([]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    setGridCameraLineId(null);
    setGridCameraUnitIndex(null);
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  const startCamera = async (currentPhotosCount = 0, gridDraftLineId?: string | null, unitIndexForGridOrList = 0) => {
    if (isFinished) return;
    setDamageSaveError(null);
    if (currentPhotosCount >= MAX_DAMAGE_PHOTOS) {
      setDamageSaveError(`Możesz dodać maks. ${MAX_DAMAGE_PHOTOS} zdjęć. Usuń jedno z miniaturek.`);
      return;
    }
    stopCamera();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setDamageSaveError("Przeglądarka nie obsługuje aparatu. Użyj „Z dysku”.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (gridDraftLineId != null && gridDraftLineId !== "") {
        setGridCameraLineId(gridDraftLineId);
        setGridCameraUnitIndex(unitIndexForGridOrList);
      } else {
        setGridCameraLineId(null);
        setGridCameraUnitIndex(null);
      }
      setCameraActive(true);
      const attach = () => {
        const v = videoRef.current;
        if (v && streamRef.current) {
          v.srcObject = streamRef.current;
          void v.play().catch(() => undefined);
        }
      };
      attach();
      requestAnimationFrame(attach);
    } catch {
      setDamageSaveError("Nie udało się uruchomić aparatu. Użyj „Z dysku”.");
      setGridCameraLineId(null);
      setGridCameraUnitIndex(null);
    }
  };

  const captureFromCamera = (lineId?: string, unitIndex = 0) => {
    if (isFinished) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth < 2) {
      setDamageSaveError("Poczekaj na podgląd z kamery, potem zrób zdjęcie.");
      return;
    }
    if (lineId) {
      const flow = gridDamagedFlowRef.current;
      const useDraft =
        gridCameraLineId === lineId &&
        unitIndex === 0 &&
        flow.mode[lineId] === "damaged" &&
        flow.open[lineId];
      const current = useDraft
        ? gridDamageDraftRef.current[lineId]?.photoUrls.length ?? 0
        : unitRowsByLineId[lineId]?.[unitIndex]?.photoUrls.length ?? 0;
      if (current >= MAX_DAMAGE_PHOTOS) {
        setDamageSaveError(`Możesz dodać maks. ${MAX_DAMAGE_PHOTOS} zdjęć.`);
        return;
      }
    } else if (damageFiles.length >= MAX_DAMAGE_PHOTOS) {
      setDamageSaveError(`Możesz dodać maks. ${MAX_DAMAGE_PHOTOS} zdjęć.`);
      return;
    }
    setDamageSaveError(null);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setDamageSaveError("Nie udało się zapisać kadru.");
          return;
        }
        void (async () => {
          setIsUploadingPhotos(true);
          try {
            const name = `camera-${Date.now()}.jpg`;
            const file = new File([blob], name, { type: "image/jpeg" });
            const url = await uploadDamageImageFile(file);
            console.log("UPLOAD RESPONSE (camera)", url);
            const normalizedUrl = coercePhotoUrlForDamageEntry(url) ?? url;
            if (lineId) {
              const flow = gridDamagedFlowRef.current;
              const useDraft =
                gridCameraLineId === lineId &&
                unitIndex === 0 &&
                flow.mode[lineId] === "damaged" &&
                flow.open[lineId];
              if (useDraft) {
                setGridDamageDraftByLineId((prev) => {
                  const d = prev[lineId] ?? EMPTY_GRID_DAMAGE_DRAFT;
                  if (d.photoUrls.length >= MAX_DAMAGE_PHOTOS) return prev;
                  return { ...prev, [lineId]: { ...d, photoUrls: [...d.photoUrls, normalizedUrl] } };
                });
              } else {
                setUnitRowsByLineId((prev) => {
                  const rows = [...(prev[lineId] ?? [])];
                  if (!rows[unitIndex]) return prev;
                  rows[unitIndex] = { ...rows[unitIndex], photoUrls: [...rows[unitIndex].photoUrls, normalizedUrl] };
                  return { ...prev, [lineId]: rows };
                });
              }
              setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
            } else {
              setDamageFiles((prev) => {
                const merged = [...prev, newDamagePhoto(normalizedUrl, name)];
                damageEvidenceUrlsRef.current = persistedUrlsFromDamageFiles(merged);
                return merged;
              });
            }
          } catch {
            setDamageSaveError("Nie udało się wysłać zdjęcia na serwer.");
          } finally {
            setIsUploadingPhotos(false);
          }
        })();
      },
      "image/jpeg",
      0.88
    );
  };

  const removeDamagePhoto = useCallback((id: string) => {
    if (isFinished) return;
    setDamageFiles((prev) => {
      const merged = prev.filter((p) => p.id !== id);
      damageEvidenceUrlsRef.current = persistedUrlsFromDamageFiles(merged);
      return merged;
    });
    setDamageSaveError(null);
  }, [isFinished]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!isFinished) return;
    stopCamera();
    setPhoneUploadSession(null);
    setSellasistCallModalOpen(false);
    setOrderDetailsModalOpen(false);
    setCorrespondenceModalOpen(false);
    setCustomerInsightsModalOpen(false);
    setGridCardMenuLineId(null);
    setDamageLine(null);
    setDamageMassMode(false);
    setDamageFiles([]);
    damageEvidenceUrlsRef.current = [];
    setDamageSaveError(null);
  }, [isFinished, stopCamera]);

  useEffect(() => {
    if (initialReturn != null && initialReturn.id === rid) {
      setWmsReturn(initialReturn);
      setSessionLoading(false);
      setSessionLoadError(null);
      return;
    }
    if (!Number.isFinite(rid) || rid <= 0) {
      if (embeddedReturnId == null) {
        navigate(WMS_ROUTES.returns, { replace: true });
      }
      return;
    }
    let cancelled = false;
    setSessionLoading(true);
    setSessionLoadError(null);
    void (async () => {
      try {
        const r = await getWmsReturn(rid, DAMAGE_TENANT_ID);
        if (cancelled) return;
        setWmsReturn(r);
        setSessionLoadError(null);
      } catch (e) {
        if (cancelled) return;
        setWmsReturn(null);
        let msg = "Nie udało się otworzyć zwrotu.";
        if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === "object") {
          const detail = (e.response.data as { detail?: unknown }).detail;
          if (typeof detail === "string" && detail.trim()) msg = detail.trim();
        }
        setSessionLoadError(msg);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rid, navigate, sessionRetryKey, embeddedReturnId, initialReturn]);

  useEffect(() => {
    if (!Number.isFinite(rid) || rid <= 0) return;
    try {
      const raw = localStorage.getItem(`wms.rmz.correspondenceNotes.${rid}`);
      setCorrespondenceNotesDraft(raw ?? "");
    } catch {
      setCorrespondenceNotesDraft("");
    }
  }, [rid]);

  const persistCorrespondenceNotes = useCallback(() => {
    if (!Number.isFinite(rid) || rid <= 0) return;
    try {
      localStorage.setItem(`wms.rmz.correspondenceNotes.${rid}`, correspondenceNotesDraft);
      setCorrespondenceNotesFlash(true);
      window.setTimeout(() => setCorrespondenceNotesFlash(false), 2000);
    } catch {
      // quota / private mode
    }
  }, [rid, correspondenceNotesDraft]);

  useEffect(() => {
    void (async () => {
      try {
        const wh = wmsReturn?.warehouse_id;
        const s = await getWmsReturnsModeSettings({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId:
            wh != null && Number.isFinite(Number(wh)) && Number(wh) > 0 ? Math.floor(Number(wh)) : undefined,
        });
        setWmsSettings(s);
      } catch {
        setWmsSettings(null);
      }
    })();
  }, [wmsReturn?.warehouse_id, wmsReturn?.id]);

  useEffect(() => {
    const wh = wmsReturn?.warehouse_id;
    let cancelled = false;
    void (async () => {
      try {
        const summary = await getReturnUiStatusSummary(DAMAGE_TENANT_ID, wh != null && Number.isFinite(Number(wh)) ? Math.floor(Number(wh)) : undefined);
        if (!cancelled) {
          setPanelUiSummary(summary);
          setPanelUiStatusesError(null);
        }
      } catch {
        if (!cancelled) {
          setPanelUiSummary(null);
          setPanelUiStatusesError("Nie udało się wczytać statusów panelu.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wmsReturn?.warehouse_id]);

  const [returnModuleWmsCfg, setReturnModuleWmsCfg] = useState<WmsReturnModuleConfigDto | null>(null);

  useEffect(() => {
    const wh = wmsReturn?.warehouse_id;
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await getWmsReturnModuleConfig({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId:
            wh != null && Number.isFinite(Number(wh)) && Number(wh) > 0 ? Math.floor(Number(wh)) : undefined,
        });
        if (!cancelled) setReturnModuleWmsCfg(cfg);
      } catch {
        if (!cancelled) setReturnModuleWmsCfg(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wmsReturn?.warehouse_id]);

  const dmgReasons = returnModuleWmsCfg?.damage_reasons ?? undefined;
  const productRejectDecisionOpts = useMemo(
    () => returnModuleWmsCfg?.product_decisions?.filter((d) => d.category === "REJECTED") ?? [],
    [returnModuleWmsCfg?.product_decisions],
  );
  const productRejectSelectPairs = useMemo(
    () => productRejectDecisionOpts.map((d) => ({ code: d.code, label: d.label })),
    [productRejectDecisionOpts],
  );

  useEffect(() => {
    const sid = wmsReturn?.ui_status?.id;
    if (sid != null && Number.isFinite(Number(sid)) && Number(sid) > 0) {
      setPendingPanelUiSubStatusId(Math.floor(Number(sid)));
    } else {
      setPendingPanelUiSubStatusId("");
    }
  }, [wmsReturn?.ui_status?.id, wmsReturn?.id]);

  useEffect(() => {
    if (!wmsReturn) {
      setLineSeeds([]);
      setLineOverrides({});
      setOrderDetailCached(null);
      return;
    }
    let cancelled = false;
    setGridLoading(true);
    setCustomerDisplay("—");
    setLineOverrides({});
    setOrderDetailCached(null);
    void (async () => {
      try {
        const res = await api.get<OrderDetailForReturn>(`orders/${wmsReturn.order_id}/`);
        if (cancelled) return;
        setOrderNumber(String(res.data.number ?? "").trim() || `#${wmsReturn.order_id}`);
        const od = res.data;
        setOrderDetailCached(od);
        const nameRaw = [od.customer_name, od.billing_name, od.recipient_name].find(
          (x) => x != null && String(x).trim() !== "",
        );
        setCustomerDisplay(nameRaw != null ? String(nameRaw).trim() : "—");
        const byOi = new Map(res.data.items.map((it) => [it.id, it]));
        const seeds = wmsReturn.lines.map((line, rowIndex) => {
          const oi = byOi.get(line.order_item_id);
          const p = oi?.product;
          const img =
            p?.image_url != null && String(p.image_url).trim() !== ""
              ? String(p.image_url).trim()
              : undefined;
          const initialDecision: LineDecision =
            line.decision === "OK"
              ? "OK"
              : line.decision === "DAMAGED"
                ? "DAMAGED"
                : line.decision === "REJECTED"
                  ? "REJECTED"
                  : "PENDING";
          const candidate: DamageCandidate = {
            productId: line.product_id,
            productName: p?.name ?? `Produkt #${line.product_id}`,
            sku: p?.sku ?? undefined,
            imageUrl: img,
            locationUUID: "",
            locationLabel: "—",
            availableQuantity: line.quantity,
            purchasePrice: 0,
          };
          return {
            lineId: wmsReturnGridLineIdFromApiLine(line, rowIndex),
            orderItemId: line.order_item_id,
            rmzLineId: line.id != null && Number.isFinite(Number(line.id)) ? Number(line.id) : null,
            candidate,
            initialDecision,
            unitPrice: oi ? parseOrderItemUnitPrice(oi) : 0,
            ean: (p?.ean || "").trim() || undefined,
            sku: (p?.sku || "").trim() || undefined,
            acceptedQty: line.accepted_qty,
            damagedQty: line.damaged_qty,
            damagedBQty: line.damaged_b_qty,
            damagedCQty: line.damaged_c_qty,
            rejectedQty: line.rejected_qty,
            damageTypeSnapshot: line.damage_type != null && String(line.damage_type).trim() !== "" ? String(line.damage_type).trim() : null,
            damagePhotoUrls: normalizeLineDamagePhotoUrls(line),
            damageEntries: Array.isArray(line.damage_entries) && line.damage_entries.length > 0 ? line.damage_entries : undefined,
          };
        });
        console.log(
          "[WMS RMZ] refresh damage_entries",
          seeds.map((s) => ({
            lineId: s.lineId,
            orderItemId: s.orderItemId,
            damageEntries: s.damageEntries ?? [],
            damagedQty: s.damagedQty ?? null,
            damagedBQty: s.damagedBQty ?? null,
            damagedCQty: s.damagedCQty ?? null,
          })),
        );
        setLineSeeds(seeds);
        const ship = resolveOrderShippingCostForRefund(od);
        setRefundShippingAmount(ship.amount);
      } catch {
        if (!cancelled) {
          setLineSeeds([]);
          setOrderNumber(`#${wmsReturn.order_id}`);
          setCustomerDisplay("—");
          setOrderDetailCached(null);
        }
      } finally {
        if (!cancelled) setGridLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wmsReturn]);

  const baseDocuments: ReturnDocumentModel[] = useMemo(() => {
    if (lineSeeds.length === 0) return [];
    const label = wmsReturn?.rmz_number?.trim() || `WS-${wmsReturn?.warehouse_id ?? 0}`;
    return [
      {
        id: `ret-${label}`,
        rmaNumber: label,
        lines: lineSeeds.map((s) => ({
          lineId: s.lineId,
          returnLineId: s.rmzLineId,
          candidate: s.candidate,
          systemStatus: s.initialDecision,
        })),
      },
    ];
  }, [lineSeeds, wmsReturn?.rmz_number, wmsReturn?.warehouse_id]);

  const mergedDocuments: ReturnDocumentModel[] = useMemo(() => {
    return baseDocuments.map((doc) => ({
      ...doc,
      lines: doc.lines.map((ln) => {
        const ov = lineOverrides[ln.lineId];
        const systemStatus = ov?.systemStatus ?? ln.systemStatus;
        return { ...ln, systemStatus };
      }),
    }));
  }, [baseDocuments, lineOverrides]);



  const allLines = mergedDocuments[0]?.lines ?? [];
  const lineSeedByLineId = useMemo(() => new Map(lineSeeds.map((s) => [s.lineId, s])), [lineSeeds]);

  useEffect(() => {
    setSavingSplitByLineId({});
    setUploadingLinePhotoById({});
    setUnitRowsByLineId((prev) => {
      const next: Record<string, UnitDecision[]> = {};
      for (const s of lineSeeds) {
        const built = buildUnitRowsForLineSeed(s, dmgReasons);
        const lineId = s.lineId;
        const old = prev[lineId];
        const dirty = !!dirtyLineIds[lineId];
        if (dirty && old && old.length === built.length) {
          next[lineId] = old;
          continue;
        }
        if (old && old.length === built.length && unitRowsQuantitiesMatchSeed(old, s)) {
          next[lineId] = old;
          continue;
        }
        next[lineId] = built;
      }
      return next;
    });
  }, [lineSeeds, dirtyLineIds, dmgReasons]);

  const applyLinePatch = useCallback((lineId: string, patch: LineOverride) => {
    if (isFinished) return;
    setLineOverrides((prev) => {
      const merged: LineOverride = { ...prev[lineId], ...patch };
      if (patch.systemStatus === "OK" || patch.systemStatus === "DAMAGED") {
        merged.rejectReasonId = undefined;
        merged.rejectReasonOtherText = undefined;
      } else if (patch.systemStatus === "REJECTED") {
        merged.rejectReasonId = patch.rejectReasonId ?? null;
        if (patch.rejectReasonId === WMS_REJECT_OTHER_ID) {
          merged.rejectReasonOtherText =
            patch.rejectReasonOtherText !== undefined
              ? patch.rejectReasonOtherText
              : prev[lineId]?.rejectReasonOtherText;
        } else {
          merged.rejectReasonOtherText = undefined;
        }
      } else {
        if (patch.rejectReasonId !== undefined) {
          merged.rejectReasonId = patch.rejectReasonId;
          if (patch.rejectReasonId !== WMS_REJECT_OTHER_ID) {
            merged.rejectReasonOtherText = undefined;
          }
        }
        if (patch.rejectReasonOtherText !== undefined) {
          merged.rejectReasonOtherText = patch.rejectReasonOtherText;
        }
      }
      return { ...prev, [lineId]: merged };
    });
  }, [isFinished]);

  const setUnitDecision = useCallback(
    (lineId: string, unitIndex: number, decision: UnitDecision["decision"]) => {
      if (isFinished) return;
      const rowsBefore = [...(unitRowsByLineId[lineId] ?? [])];
      if (!rowsBefore[unitIndex]) return;
      const rows = [...rowsBefore];
      rows[unitIndex] = {
        ...rows[unitIndex],
        decision,
        photoUrls: decision === "DAMAGED" ? rows[unitIndex].photoUrls : [],
        damageTypeIds: decision === "DAMAGED" ? rows[unitIndex].damageTypeIds : [],
        damageEntryId:
          decision === "DAMAGED"
            ? rows[unitIndex].damageEntryId ?? crypto.randomUUID()
            : null,
      };
      const seed = lineSeedByLineId.get(lineId);
      const total = seed ? Math.max(0, Math.floor(seed.candidate.availableQuantity)) : 0;
      const fullLineAccept =
        decision === "ACCEPTED" && total > 0 && rows.length === total && rows.every((r) => r.decision === "ACCEPTED");

      setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
      setUnitRowsByLineId((prev) => ({ ...prev, [lineId]: rows }));

      if (fullLineAccept) {
        applyLinePatch(lineId, { systemStatus: "OK" });
        setInlineSaveToast("Przyjęto lokalnie — użyj ZAPISZ u góry");
        window.setTimeout(() => setInlineSaveToast(null), 2200);
      }
    },
    [isFinished, unitRowsByLineId, lineSeedByLineId, applyLinePatch],
  );

  const setUnitDamageClass = useCallback((lineId: string, unitIndex: number, damageClass: "B" | "C") => {
    if (isFinished) return;
    setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
    setUnitRowsByLineId((prev) => {
      const rows = [...(prev[lineId] ?? [])];
      if (!rows[unitIndex]) return prev;
      const nextTypes = filterRmzDamageTypeIdsForClass(damageClass, rows[unitIndex].damageTypeIds, dmgReasons);
      rows[unitIndex] = { ...rows[unitIndex], damageClass, damageTypeIds: nextTypes };
      return { ...prev, [lineId]: rows };
    });
  }, [isFinished, dmgReasons]);

  /** Szybki podział ilości na linię (np. 1 OK + 2 uszkodzone); typy uszkodzeń uzupełnij per sztuka lub w panelu uszkodzenia. */
  const toggleUnitDamageType = useCallback((lineId: string, unitIndex: number, id: RmzDamageTypeId) => {
    if (isFinished) return;
    setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
    setUnitRowsByLineId((prev) => {
      const rows = [...(prev[lineId] ?? [])];
      const row = rows[unitIndex];
      if (!row || row.decision !== "DAMAGED") return prev;
      const allowed = new Set(rmzDamageTypesForClassResolved(row.damageClass, dmgReasons).map((o) => o.id));
      if (!allowed.has(String(id))) return prev;
      const has = row.damageTypeIds.includes(id);
      const nextIds = has ? row.damageTypeIds.filter((x) => x !== id) : [...row.damageTypeIds, id];
      rows[unitIndex] = { ...row, damageTypeIds: nextIds };
      return { ...prev, [lineId]: rows };
    });
  }, [isFinished, dmgReasons]);

  const setAllUnitsDecisionForLine = useCallback((lineId: string, decision: UnitDecision["decision"], onlyEmpty = false) => {
    if (isFinished) return;
    setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
    setUnitRowsByLineId((prev) => {
      const rows = prev[lineId] ?? [];
      if (rows.length === 0) return prev;
      const nextRows = rows.map((row) => {
        if (onlyEmpty && row.decision != null) return row;
        return {
          ...row,
          decision,
          photoUrls: decision === "DAMAGED" ? row.photoUrls : [],
          damageTypeIds: decision === "DAMAGED" ? row.damageTypeIds : [],
          damageEntryId: decision === "DAMAGED" ? crypto.randomUUID() : null,
          damageNote: decision === "DAMAGED" ? row.damageNote ?? null : null,
        };
      });
      return { ...prev, [lineId]: nextRows };
    });
  }, [isFinished]);

  const setFirstNNullUnitsDecision = useCallback(
    (lineId: string, decision: "ACCEPTED" | "DAMAGED" | "REJECTED", n: number, patch?: Partial<UnitDecision>) => {
      if (isFinished) return;
      let left = Math.max(0, Math.floor(n));
      setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
      setUnitRowsByLineId((prev) => {
        const rows = [...(prev[lineId] ?? [])];
        for (let i = 0; i < rows.length && left > 0; i += 1) {
          if (rows[i]!.decision != null) continue;
          rows[i] = {
            ...rows[i]!,
            decision,
            damageClass: (patch?.damageClass as "B" | "C" | undefined) ?? rows[i]!.damageClass,
            photoUrls: decision === "DAMAGED" ? [...(patch?.photoUrls ?? rows[i]!.photoUrls)] : [],
            damageTypeIds: decision === "DAMAGED" ? [...(patch?.damageTypeIds ?? rows[i]!.damageTypeIds)] : [],
            damageEntryId: decision === "DAMAGED" ? crypto.randomUUID() : null,
            damageNote:
              decision === "DAMAGED"
                ? (patch?.damageNote !== undefined ? patch.damageNote : rows[i]!.damageNote ?? null)
                : null,
          };
          left -= 1;
        }
        return { ...prev, [lineId]: rows };
      });
    },
    [isFinished],
  );

  const resetGridLineDecision = useCallback(
    (lineId: string) => {
      if (isFinished) return;
      stopCamera();
      const seed = lineSeedByLineId.get(lineId);
      const total = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      setUnitRowsByLineId((prev) => ({
        ...prev,
        [lineId]: seed ? buildUnitRowsForLineSeed(seed, dmgReasons) : Array.from({ length: total }, () => ({
          decision: null,
          damageClass: "B" as const,
          photoUrls: [],
          damageTypeIds: [],
          damageEntryId: null,
          damageNote: null,
        })),
      }));
      setLineOverrides((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setGridLineModeByLineId((prev) => ({ ...prev, [lineId]: "idle" }));
      setGridDamagedOpenByLineId((prev) => ({ ...prev, [lineId]: false }));
      setGridDamageDraftByLineId((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setGridRejectDraftByLineId((prev) => ({ ...prev, [lineId]: "" }));
      setGridRejectOtherDraftByLineId((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setPendingRejectBatchByLineId((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setGridQtyPickDraftByLineId((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setGridUnlockEditByLineId((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setDirtyLineIds((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setDamageSaveError(null);
    },
    [isFinished, lineSeedByLineId, stopCamera],
  );

  const startEditSavedGridLine = useCallback(
    (lineId: string) => {
      if (isFinished) return;
      setGridUnlockEditByLineId((prev) => ({ ...prev, [lineId]: true }));
      setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
      setGridLineModeByLineId((prev) => ({ ...prev, [lineId]: "idle" }));
      setGridDamagedOpenByLineId((prev) => ({ ...prev, [lineId]: false }));
      setDamageSaveError(null);
    },
    [isFinished],
  );

  const openDamagedEditorForLine = useCallback(
    (_lineId: string, _ignoredDamagedUnitCount?: number) => {
      if (isFinished) return;
      const lineId = _lineId;
      const seed = lineSeedByLineId.get(lineId);
      const qty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      const rowsNow = unitRowsByLineId[lineId] ?? [];
      const pending = rowsNow.filter((r) => r.decision === null).length;
      if (pending < 1) return;
      setDamageSaveError(null);
      setGridDamageDraftByLineId((prev) => ({
        ...prev,
        [lineId]: { ...EMPTY_GRID_DAMAGE_DRAFT },
      }));
      setRefundAmountByLineId((prev) => ({ ...prev, [lineId]: 0 }));
      setActiveLineId(lineId);
      setGridLineModeByLineId((prev) => ({ ...prev, [lineId]: "damaged" }));
      setGridDamagedOpenByLineId((prev) => ({ ...prev, [lineId]: true }));
    },
    [isFinished, lineSeedByLineId, unitRowsByLineId],
  );

  const openRejectEditorForLine = useCallback(
    (lineId: string) => {
      if (isFinished) return;
      setDamageSaveError(null);
      setGridLineModeByLineId((prev) => ({ ...prev, [lineId]: "reject" }));
      setGridDamagedOpenByLineId((prev) => ({ ...prev, [lineId]: false }));
      setGridRejectDraftByLineId((prev) => {
        const existing = prev[lineId];
        const seeded =
          existing != null && existing !== ""
            ? existing
            : lineOverrides[lineId]?.rejectReasonId ?? "";
        return { ...prev, [lineId]: seeded };
      });
      setGridRejectOtherDraftByLineId((prev) => {
        const existing = prev[lineId];
        const seeded =
          existing != null && existing !== ""
            ? existing
            : lineOverrides[lineId]?.rejectReasonOtherText ?? "";
        return { ...prev, [lineId]: seeded };
      });
      setActiveLineId(lineId);
    },
    [isFinished, lineOverrides],
  );

  const cancelGridQtyPick = useCallback(
    (lineId: string) => {
      if (isFinished) return;
      setGridLineModeByLineId((prev) => ({ ...prev, [lineId]: "idle" }));
      setGridQtyPickDraftByLineId((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setDamageSaveError(null);
    },
    [isFinished],
  );

  const bumpGridQtyPickDraft = useCallback((lineId: string, delta: number, max: number) => {
    const cap = Math.max(1, Math.floor(max));
    setGridQtyPickDraftByLineId((prev) => {
      const cur = prev[lineId] ?? 1;
      const next = Math.max(1, Math.min(cap, Math.floor(cur + delta)));
      return { ...prev, [lineId]: next };
    });
  }, []);

  const beginGridDecision = useCallback(
    (lineId: string, decision: "ACCEPTED" | "DAMAGED" | "REJECTED") => {
      if (isFinished) return;
      const seed = lineSeedByLineId.get(lineId);
      const qty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      if (!seed || qty < 1) return;
      let rows = unitRowsByLineId[lineId] ?? [];
      if (rows.length !== qty) {
        const built = buildUnitRowsForLineSeed(seed, dmgReasons);
        flushSync(() => {
          setUnitRowsByLineId((prev) => ({ ...prev, [lineId]: built }));
        });
        rows = built;
      }
      const pendingNull = rows.filter((r) => r.decision === null).length;
      if (pendingNull < 1) return;

      setDamageSaveError(null);
      const pickDefault = Math.min(
        pendingNull,
        Math.max(1, Math.floor(gridQtyPickDraftByLineId[lineId] ?? 1)),
      );

      const returnId =
        wmsReturn?.id != null && Number.isFinite(Number(wmsReturn.id)) && Number(wmsReturn.id) > 0
          ? Math.floor(Number(wmsReturn.id))
          : Number.isFinite(rid) && rid > 0
            ? rid
            : null;
      console.log("[returns.report.click]", {
        return_id: returnId,
        line_id: lineId,
        click_timestamp: Date.now(),
        decision,
        selected_state_before: {
          gridLineMode: gridLineModeByLineId[lineId] ?? "idle",
          pickDraft: gridQtyPickDraftByLineId[lineId] ?? null,
        },
        pending_null: pendingNull,
        qty,
      });

      if (decision === "ACCEPTED") {
        if (pendingNull === 1) {
          void confirmPickAcceptSaveRef.current(lineId, 1);
          return;
        }
        setGridLineModeByLineId((prev) => ({ ...prev, [lineId]: "pick_accept" }));
        setGridQtyPickDraftByLineId((prev) => ({ ...prev, [lineId]: pickDefault }));
        return;
      }
      if (decision === "DAMAGED") {
        openDamagedEditorForLine(lineId, 1);
        return;
      }
      if (pendingNull === 1) {
        setPendingRejectBatchByLineId((prev) => ({ ...prev, [lineId]: 1 }));
        openRejectEditorForLine(lineId);
        return;
      }
      setGridLineModeByLineId((prev) => ({ ...prev, [lineId]: "pick_reject_qty" }));
      setGridQtyPickDraftByLineId((prev) => ({ ...prev, [lineId]: pickDefault }));
    },
    [
      gridLineModeByLineId,
      gridQtyPickDraftByLineId,
      dmgReasons,
      isFinished,
      lineSeedByLineId,
      openDamagedEditorForLine,
      openRejectEditorForLine,
      rid,
      unitRowsByLineId,
      wmsReturn?.id,
    ],
  );

  const confirmPickAcceptSave = useCallback(
    async (lineId: string, pickCountOverride?: number) => {
      if (isFinished) return;
      const seed = lineSeedByLineId.get(lineId);
      const qty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      if (!seed || qty < 1) return;
      let rows = [...(unitRowsByLineId[lineId] ?? [])];
      if (rows.length !== qty) {
        const built = buildUnitRowsForLineSeed(seed, dmgReasons);
        flushSync(() => {
          setUnitRowsByLineId((prev) => ({ ...prev, [lineId]: built }));
        });
        rows = [...built];
      }
      const pendingNull = rows.filter((r) => r.decision === null).length;
      const pick =
        pickCountOverride != null && Number.isFinite(pickCountOverride)
          ? pickCountOverride
          : (gridQtyPickDraftByLineId[lineId] ?? 1);
      const k = Math.max(1, Math.min(pendingNull, Math.floor(pick)));
      const returnId =
        wmsReturn?.id != null && Number.isFinite(Number(wmsReturn.id)) && Number(wmsReturn.id) > 0
          ? Math.floor(Number(wmsReturn.id))
          : Number.isFinite(rid) && rid > 0
            ? rid
            : null;
      console.log("[returns.report.submit]", {
        return_id: returnId,
        line_id: lineId,
        click_timestamp: Date.now(),
        pick_count: k,
        pending_null: pendingNull,
        immediate: pickCountOverride != null,
      });
      const rowsAfter = applyFirstNNullUnitsDecisionToRows(rows, "ACCEPTED", k);
      const willCompleteLine =
        qty > 0 && rowsAfter.length === qty && rowsAfter.every((r) => r.decision === "ACCEPTED");

      flushSync(() => {
        setFirstNNullUnitsDecision(lineId, "ACCEPTED", k);
      });
      cancelGridQtyPick(lineId);
      setGridDamagedOpenByLineId((prev) => ({ ...prev, [lineId]: false }));

      if (willCompleteLine) {
        applyLinePatch(lineId, { systemStatus: "OK" });
      }

      setInlineSaveToast(
        willCompleteLine ? "Przyjęto lokalnie — użyj ZAPISZ u góry" : "Częściowo oznaczono — użyj ZAPISZ u góry",
      );
      window.setTimeout(() => setInlineSaveToast(null), 2200);
    },
    [
      applyLinePatch,
      cancelGridQtyPick,
      gridQtyPickDraftByLineId,
      isFinished,
      lineSeedByLineId,
      rid,
      unitRowsByLineId,
      setFirstNNullUnitsDecision,
      wmsReturn?.id,
    ],
  );
  confirmPickAcceptSaveRef.current = confirmPickAcceptSave;

  const confirmPickRejectQtyContinue = useCallback(
    (lineId: string) => {
      if (isFinished) return;
      const seed = lineSeedByLineId.get(lineId);
      const qty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      if (!seed || qty < 1) return;
      const rows = unitRowsByLineId[lineId] ?? [];
      const pendingNull = rows.filter((r) => r.decision === null).length;
      const pick = gridQtyPickDraftByLineId[lineId] ?? 1;
      const k = Math.max(1, Math.min(pendingNull, Math.floor(pick)));
      setPendingRejectBatchByLineId((prev) => ({ ...prev, [lineId]: k }));
      cancelGridQtyPick(lineId);
      openRejectEditorForLine(lineId);
    },
    [cancelGridQtyPick, gridQtyPickDraftByLineId, isFinished, lineSeedByLineId, openRejectEditorForLine, unitRowsByLineId],
  );

  const confirmPickDamageQtyContinue = useCallback(
    (lineId: string) => {
      if (isFinished) return;
      const seed = lineSeedByLineId.get(lineId);
      const qty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      if (!seed || qty < 1) return;
      const rows = unitRowsByLineId[lineId] ?? [];
      const pendingNull = rows.filter((r) => r.decision === null).length;
      const pick = gridQtyPickDraftByLineId[lineId] ?? 1;
      const k = Math.max(1, Math.min(pendingNull, Math.floor(pick)));
      cancelGridQtyPick(lineId);
      openDamagedEditorForLine(lineId, k);
    },
    [cancelGridQtyPick, gridQtyPickDraftByLineId, isFinished, lineSeedByLineId, openDamagedEditorForLine, unitRowsByLineId],
  );

  const handleGridDecision = useCallback(
    (lineId: string, type: "accepted" | "damaged" | "rejected") => {
      const map = { accepted: "ACCEPTED", damaged: "DAMAGED", rejected: "REJECTED" } as const;
      beginGridDecision(lineId, map[type]);
    },
    [beginGridDecision],
  );

  /** Potwierdzenie odrzucenia w gridzie: jednostki + powód, przy pełnej linii od razu `process` REJECTED (jak accept). */
  const confirmGridRejectEditor = useCallback(
    (lineId: string, ridRaw: string, otherDraft: string) => {
      if (isFinished) return;
      const rid = ridRaw.trim();
      if (!rid) {
        setDamageSaveError("Wybierz powód z listy (dlaczego odrzucasz zwrot).");
        return;
      }
      if (rid === WMS_REJECT_OTHER_ID && !otherDraft.trim()) {
        setDamageSaveError("Uzupełnij uzasadnienie (wymagane przy „Inny powód”).");
        return;
      }
      setDamageSaveError(null);

      const seed = lineSeedByLineId.get(lineId);
      const qty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      if (!seed || qty < 1) return;

      let rows = [...(unitRowsByLineId[lineId] ?? [])];
      if (rows.length !== qty) {
        const built = buildUnitRowsForLineSeed(seed, dmgReasons);
        flushSync(() => {
          setUnitRowsByLineId((prev) => ({ ...prev, [lineId]: built }));
        });
        rows = built;
      }
      const pendingNull = rows.filter((r) => r.decision === null).length;
      const pb = pendingRejectBatchByLineId[lineId];
      const batch = pb != null && pb > 0 ? Math.min(pendingNull, pb) : pendingNull;
      if (batch < 1) {
        setDamageSaveError("Brak sztuk do oznaczenia jako odrzucone — odśwież i spróbuj ponownie.");
        return;
      }

      const rowsAfter = applyFirstNNullUnitsDecisionToRows(rows, "REJECTED", batch);
      const willAllRejected =
        qty > 0 && rowsAfter.length === qty && rowsAfter.every((r) => r.decision === "REJECTED");

      flushSync(() => {
        setFirstNNullUnitsDecision(lineId, "REJECTED", batch);
      });

      if (willAllRejected) {
        if (rid === WMS_REJECT_OTHER_ID) {
          applyLinePatch(lineId, {
            systemStatus: "REJECTED",
            rejectReasonId: rid,
            rejectReasonOtherText: otherDraft.trim(),
          });
        } else {
          applyLinePatch(lineId, { systemStatus: "REJECTED", rejectReasonId: rid });
        }
      } else if (rid === WMS_REJECT_OTHER_ID) {
        applyLinePatch(lineId, {
          rejectReasonId: rid,
          rejectReasonOtherText: otherDraft.trim(),
        });
      } else {
        applyLinePatch(lineId, { rejectReasonId: rid });
      }

      setPendingRejectBatchByLineId((prev) => {
        const n = { ...prev };
        delete n[lineId];
        return n;
      });
      setGridLineModeByLineId((prev) => ({ ...prev, [lineId]: "idle" }));

      setInlineSaveToast(
        willAllRejected ? "Odrzucono lokalnie — użyj ZAPISZ u góry" : "Częściowo odrzucono — użyj ZAPISZ u góry",
      );
      window.setTimeout(() => setInlineSaveToast(null), 2200);
    },
    [
      isFinished,
      lineSeedByLineId,
      unitRowsByLineId,
      pendingRejectBatchByLineId,
      applyLinePatch,
      setFirstNNullUnitsDecision,
    ],
  );

  const saveDamagedProductCard = useCallback(
    (lineId: string) => {
      if (isFinished) return;
      const seed = lineSeedByLineId.get(lineId);
      const totalQty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      if (totalQty < 1 || !seed) return;

      const draft = gridDamageDraftByLineId[lineId] ?? EMPTY_GRID_DAMAGE_DRAFT;
      const uiClass = draft.damageClass;
      if (uiClass == null) {
        setDamageSaveError("Wybierz klasę uszkodzenia (B lub C).");
        return;
      }

      const typePick = filterRmzDamageTypeIdsForClass(uiClass, draft.damageTypeIds);
      if (typePick.length < 1) {
        setDamageSaveError("Wybierz co najmniej jeden typ uszkodzenia.");
        return;
      }

      const desiredDamagedQty = 1;
      const photoUrls = draft.photoUrls;

      setDamageSaveError(null);

      let computedRows: UnitDecision[] = [];
      const noteTrim = draft.note.trim();
      const damageOperator = resolveDamageOperatorNameFallback(createdBy);
      const damageCreatedAt = new Date().toISOString();
      flushSync(() => {
        setUnitRowsByLineId((prev) => {
          const rows = [...(prev[lineId] ?? [])];
          const pics = [...photoUrls];
          const dt = [...typePick];
          let left = desiredDamagedQty;
          for (let i = 0; i < rows.length && left > 0; i += 1) {
            if (rows[i]!.decision != null) continue;
            rows[i] = {
              ...rows[i]!,
              decision: "DAMAGED",
              damageClass: uiClass,
              photoUrls: [...pics],
              damageTypeIds: [...dt],
              damageEntryId: crypto.randomUUID(),
              damageNote: noteTrim || null,
              damageOperator,
              damageCreatedAt,
            };
            left -= 1;
          }
          computedRows = rows;
          return { ...prev, [lineId]: rows };
        });
        setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
      });

      setGridLineModeByLineId((prev) => ({ ...prev, [lineId]: "idle" }));
      setGridDamagedOpenByLineId((prev) => ({ ...prev, [lineId]: false }));

      const allResolved =
        computedRows.length === totalQty &&
        computedRows.length > 0 &&
        computedRows.every((r) => r.decision != null);

      const clearDamageDraft = () =>
        setGridDamageDraftByLineId((prev) => {
          const next = { ...prev };
          delete next[lineId];
          return next;
        });

      const homDamaged =
        allResolved && computedRows.length === totalQty && computedRows.every((r) => r.decision === "DAMAGED");
      const homOk =
        allResolved && computedRows.length === totalQty && computedRows.every((r) => r.decision === "ACCEPTED");
      if (homDamaged) applyLinePatch(lineId, { systemStatus: "DAMAGED" });
      else if (homOk) applyLinePatch(lineId, { systemStatus: "OK" });

      if (allResolved) clearDamageDraft();
      setInlineSaveToast(
        allResolved ? "Oznaczono lokalnie — użyj ZAPISZ u góry" : "Częściowo oznaczono — użyj ZAPISZ u góry",
      );
      window.setTimeout(() => setInlineSaveToast(null), 2200);
    },
    [isFinished, lineSeedByLineId, gridDamageDraftByLineId, applyLinePatch, createdBy],
  );

  const removeUnitPhotoAt = useCallback((lineId: string, unitIndex: number, urlIndex: number) => {
    if (isFinished) return;
    setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
    setUnitRowsByLineId((prev) => {
      const rows = [...(prev[lineId] ?? [])];
      if (!rows[unitIndex]) return prev;
      const nextUrls = rows[unitIndex].photoUrls.filter((_, j) => j !== urlIndex);
      rows[unitIndex] = { ...rows[unitIndex], photoUrls: nextUrls };
      return { ...prev, [lineId]: rows };
    });
  }, [isFinished]);

  const uploadUnitPhotos = useCallback(async (lineId: string, unitIndex: number, files: FileList | null) => {
    if (isFinished) return;
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => isProbablyImageFile(f));
    if (imageFiles.length === 0) return;
    const uploadKey = `${lineId}:${unitIndex}`;
    setUploadingLinePhotoById((prev) => ({ ...prev, [uploadKey]: true }));
    try {
      const urls: string[] = [];
      for (const f of imageFiles) {
        const p = await uploadDamageImageFile(f);
        urls.push(coercePhotoUrlForDamageEntry(p) ?? p);
      }
      const flow = gridDamagedFlowRef.current;
      const useDraft =
        unitIndex === 0 && flow.mode[lineId] === "damaged" && flow.open[lineId];
      if (useDraft) {
        setGridDamageDraftByLineId((prev) => {
          const d = prev[lineId] ?? EMPTY_GRID_DAMAGE_DRAFT;
          const space = Math.max(0, MAX_DAMAGE_PHOTOS - d.photoUrls.length);
          const add = urls.slice(0, space);
          if (add.length === 0) return prev;
          return { ...prev, [lineId]: { ...d, photoUrls: [...d.photoUrls, ...add] } };
        });
      } else {
        setUnitRowsByLineId((prev) => {
          const rows = [...(prev[lineId] ?? [])];
          if (!rows[unitIndex]) return prev;
          rows[unitIndex] = { ...rows[unitIndex], photoUrls: [...rows[unitIndex].photoUrls, ...urls] };
          return { ...prev, [lineId]: rows };
        });
      }
      setDirtyLineIds((prev) => ({ ...prev, [lineId]: true }));
    } catch (e) {
      console.error("[returns.damage.upload] failed", { lineId, unitIndex, error: e });
      setDamageSaveError(formatDamageSaveApiError(e) || "Nie udało się przesłać zdjęcia. Spróbuj ponownie.");
    } finally {
      setUploadingLinePhotoById((prev) => ({ ...prev, [uploadKey]: false }));
    }
  }, [isFinished]);

  const extractSessionPhotoUrls = useCallback((payload: unknown): string[] => {
    if (!payload || typeof payload !== "object") return [];
    const data = payload as Record<string, unknown>;
    const pools: unknown[] = [
      data.photos,
      data.photo_urls,
      data.urls,
      data.items,
      (data.session as Record<string, unknown> | undefined)?.photos,
      (data.session as Record<string, unknown> | undefined)?.photo_urls,
    ];
    const out: string[] = [];
    for (const pool of pools) {
      if (!Array.isArray(pool)) continue;
      for (const item of pool) {
        if (typeof item === "string") {
          const c = coercePhotoUrlForDamageEntry(item) ?? item;
          if (c) out.push(c);
          continue;
        }
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const raw = obj.url ?? obj.photo_url ?? obj.path;
          if (typeof raw === "string") {
            const c = coercePhotoUrlForDamageEntry(raw) ?? raw;
            if (c) out.push(c);
          }
        }
      }
    }
    return Array.from(new Set(out));
  }, []);

  const openPhoneUploadSessionForUnit = useCallback(async (lineId: string, unitIndex: number) => {
    if (isFinished) return;
    setDamageSaveError(null);
    try {
      const createRes = await wmsPhotoUploadClient.post(
        "/wms/photo-upload/session",
        {},
        { params: { tenant_id: DAMAGE_TENANT_ID } },
      );
      const sessionIdRaw = (createRes.data?.session_id ?? createRes.data?.id ?? createRes.data?.sessionId) as string | undefined;
      const sessionId = sessionIdRaw != null ? String(sessionIdRaw).trim() : "";
      if (!sessionId) {
        setDamageSaveError("Nie udało się utworzyć sesji uploadu telefonu.");
        return;
      }
      const publicBase = getPublicBaseUrl();
      const fallbackBase = `${window.location.protocol}//${window.location.hostname}:5173`;
      const baseForQr = (publicBase || fallbackBase).replace(/\/+$/, "");
      const qrTarget = `${baseForQr}/wms-upload/${encodeURIComponent(sessionId)}`;
      const qrDataUrl = await QRCode.toDataURL(qrTarget, { width: 260, margin: 1 });
      const draftOpen =
        (gridLineModeByLineId[lineId] ?? "idle") === "damaged" && !!gridDamagedOpenByLineId[lineId];
      const rowUrls =
        draftOpen && unitIndex === 0
          ? (gridDamageDraftByLineId[lineId]?.photoUrls ?? [])
          : (unitRowsByLineId[lineId]?.[unitIndex]?.photoUrls ?? []);
      const dl = damageLineRef.current;
      const modalForLine = dl != null && dl.lineId === lineId;
      const modalUrls = modalForLine ? persistedUrlsFromDamageFiles(damageFilesRef.current) : [];
      setPhoneUploadSession({
        lineId,
        unitIndex,
        sessionId,
        qrDataUrl,
        seenUrls: Array.from(new Set([...rowUrls, ...modalUrls])),
      });
    } catch (e) {
      console.error("PHONE UPLOAD SESSION CREATE FAILED", e);
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        setDamageSaveError("Upload przez telefon niedostępny (backend missing)");
      } else {
        setDamageSaveError("Nie udało się uruchomić uploadu przez telefon.");
      }
    }
  }, [isFinished, unitRowsByLineId, gridLineModeByLineId, gridDamagedOpenByLineId, gridDamageDraftByLineId]);

  /** Najpierw nierozstrzygnięte / ze zmianami lokalnymi; w pełni zapisane na końcu (bez zmiany układu całej strony). */
  const displayLines = useMemo(() => {
    const lines = [...allLines];
    const tierOf = (ln: (typeof lines)[number]) => {
      const seed = lineSeedByLineId.get(ln.lineId);
      const qty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      const rows = unitRowsByLineId[ln.lineId] ?? [];
      const checkedCount = rows.filter((r) => r.decision != null).length;
      const isProcessed = checkedCount >= qty && qty > 0;
      const lineDirty = !!dirtyLineIds[ln.lineId];
      const cardUnlockedForEdit = !!gridUnlockEditByLineId[ln.lineId];
      const fullySavedResolved = isProcessed && !lineDirty && !cardUnlockedForEdit;
      return fullySavedResolved ? 1 : 0;
    };
    lines.sort((a, b) => tierOf(a) - tierOf(b) || a.lineId.localeCompare(b.lineId));
    return lines;
  }, [allLines, lineSeedByLineId, unitRowsByLineId, dirtyLineIds, gridUnlockEditByLineId]);

  const returnsProgress = useMemo(() => {
    let totalUnits = 0;
    let resolvedUnits = 0;
    let accepted = 0;
    let damaged = 0;
    let rejected = 0;
    for (const s of lineSeeds) {
      const qty = Math.max(0, Math.floor(s.candidate.availableQuantity));
      const rows = unitRowsByLineId[s.lineId] ?? [];
      totalUnits += qty;
      for (let i = 0; i < qty; i += 1) {
        const d = rows[i]?.decision;
        if (d == null) continue;
        resolvedUnits += 1;
        if (d === "ACCEPTED") accepted += 1;
        else if (d === "DAMAGED") damaged += 1;
        else if (d === "REJECTED") rejected += 1;
      }
    }
    return {
      totalUnits,
      resolvedUnits,
      unresolvedUnits: Math.max(0, totalUnits - resolvedUnits),
      accepted,
      damaged,
      rejected,
    };
  }, [lineSeeds, unitRowsByLineId]);

  const rmzSidebarItems = useMemo(
    () =>
      displayLines.map((ln) => {
        const seed = lineSeedByLineId.get(ln.lineId);
        const qty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
        const rows = unitRowsByLineId[ln.lineId] ?? [];
        const { status } = resolveRmzLineSidebarStatus(qty, rows);
        return {
          lineId: ln.lineId,
          productName: ln.candidate.productName,
          imageUrl: ln.candidate.imageUrl ?? null,
          qty,
          status,
        };
      }),
    [displayLines, lineSeedByLineId, unitRowsByLineId],
  );

  const visibleSidebarItems = useMemo(() => {
    if (!hideResolvedProducts) return rmzSidebarItems;
    return rmzSidebarItems.filter((item) => item.status === "pending" || item.status === "mixed");
  }, [rmzSidebarItems, hideResolvedProducts]);

  const saveSplitForLine = useCallback(
    async (
      lineId: string,
      rowsOverride?: UnitDecision[] | null,
      opts?: SaveSplitForLineOpts,
    ): Promise<boolean> => {
      if (isFinished) return false;
      const effectiveReturnDbId =
        wmsReturn?.id != null && Number.isFinite(Number(wmsReturn.id)) && Number(wmsReturn.id) > 0
          ? Math.floor(Number(wmsReturn.id))
          : selectedReturnDbId != null
            ? selectedReturnDbId
            : Number.isFinite(rid) && rid > 0
              ? rid
              : null;
      if (effectiveReturnDbId == null) {
        setDamageSaveError("Brak identyfikatora zwrotu — odśwież stronę lub otwórz dokument ponownie.");
        return false;
      }
      const seed = lineSeedByLineId.get(lineId);
      if (!seed) return false;
      const whId = wmsReturn?.warehouse_id;
      if (whId == null || !Number.isFinite(Number(whId))) {
        setDamageSaveError("Brak skonfigurowanego magazynu.");
        return false;
      }
      const total = Math.max(0, Math.floor(seed.candidate.availableQuantity));
      const rows = rowsOverride ?? unitRowsByLineId[lineId] ?? [];
      if (rows.length !== total) {
        setDamageSaveError("Niezgodna liczba wierszy jednostek — odśwież widok.");
        return false;
      }
      const slice = rows.slice(0, total);
      const resolvedCells = slice.filter((r) => r.decision != null).length;
      if (resolvedCells < 1) {
        setDamageSaveError("Zapisz co najmniej jedną rozstrzygniętą sztukę.");
        return false;
      }

      for (let i = 0; i < slice.length; i += 1) {
        const r = slice[i]!;
        if (r.decision == null) continue;
        if (r.decision === "DAMAGED") {
          if (filterRmzDamageTypeIdsForClass(r.damageClass, r.damageTypeIds, dmgReasons).length < 1) {
            setDamageSaveError("Dla każdej uszkodzonej sztuki wybierz co najmniej jeden typ uszkodzenia.");
            return false;
          }
        }
      }

      const accepted = slice.filter((r) => r.decision === "ACCEPTED").length;
      const damagedRows = slice.filter((r) => r.decision === "DAMAGED");
      const rejected = slice.filter((r) => r.decision === "REJECTED").length;
      const allDamagePhotoUrls = [...new Set(damagedRows.flatMap((r) => r.photoUrls))];

      const aggregated = {
        accepted,
        damaged: damagedRows.length,
        damagedB: damagedRows.filter((r) => r.damageClass === "B").length,
        damagedC: damagedRows.filter((r) => r.damageClass === "C").length,
        rejected,
      };

      const resolvedSum = aggregated.accepted + aggregated.damaged + aggregated.rejected;
      if (resolvedSum > total) {
        setDamageSaveError("Łącznie rozstrzygniętych sztuk nie może przekraczać ilości pozycji.");
        return false;
      }

      if (rejected > 0) {
        const rejOpts = opts?.rejectReasonForSplit ?? opts?.fullLineRejectReason;
        const ovLine = lineOverrides[lineId];
        const rk =
          (rejOpts?.reasonId?.trim() ||
            (ovLine?.rejectReasonId != null && String(ovLine.rejectReasonId).trim() !== ""
              ? String(ovLine.rejectReasonId).trim()
              : "")) || "";
        if (!rk) {
          setDamageSaveError("Brak powodu odrzucenia dla zapisu.");
          return false;
        }
        const noteTrim =
          rk === WMS_REJECT_OTHER_ID
            ? String(rejOpts?.otherText ?? ovLine?.rejectReasonOtherText ?? "").trim()
            : "";
        if (rk === WMS_REJECT_OTHER_ID && !noteTrim) {
          setDamageSaveError("Uzupełnij uzasadnienie (wymagane przy „Inny powód”).");
          return false;
        }
      }

          const encodedDamageTypes = mergeRmzDamageTypePayloadFromUnits(
            slice.map((r) => ({ decision: r.decision, damageTypeIds: r.damageTypeIds })),
            dmgReasons,
          );
          const classesValid = aggregated.damagedB + aggregated.damagedC === aggregated.damaged;
          if (!classesValid) {
            setDamageSaveError("Niezgodny podział klas uszkodzenia (B/C).");
            return false;
          }

          const damage_entries =
            aggregated.damaged > 0 ? buildDamageEntriesForSplitPayload(slice, dmgReasons) : [];

          const completeLine = resolvedSum >= total;

      const hydrate = opts?.hydrateReturn === true;
      const commitWorkflow = opts?.commitWorkflow === true;
      setSavingSplitByLineId((prev) => ({ ...prev, [lineId]: true }));
      try {
        if (completeLine && aggregated.damaged > 0 && allDamagePhotoUrls.length > 0) {
          await createDamageEntry({
            tenant_id: DAMAGE_TENANT_ID,
            warehouse_id: Number(whId),
            product_id: seed.candidate.productId,
            quantity: aggregated.damaged,
            photo_urls: allDamagePhotoUrls,
            damage_type: encodedDamageTypes || "other",
          });
        }

        let ret: WmsReturnRead;
        const allRejectedLine =
          completeLine &&
          aggregated.damaged === 0 &&
          aggregated.accepted === 0 &&
          aggregated.rejected === total &&
          total > 0;
        const allOkLine =
          completeLine &&
          aggregated.damaged === 0 &&
          aggregated.rejected === 0 &&
          aggregated.accepted === total &&
          total > 0;

        if (allRejectedLine) {
          const fromOpts = opts?.fullLineRejectReason?.reasonId?.trim()
            ? opts.fullLineRejectReason
            : opts?.rejectReasonForSplit?.reasonId?.trim()
              ? opts.rejectReasonForSplit
              : null;
          const ovLine = lineOverrides[lineId];
          const fromOverrides =
            ovLine?.rejectReasonId != null && String(ovLine.rejectReasonId).trim() !== ""
              ? {
                  reasonId: String(ovLine.rejectReasonId).trim(),
                  otherText:
                    ovLine.rejectReasonId === WMS_REJECT_OTHER_ID ? ovLine.rejectReasonOtherText : undefined,
                }
              : null;
          const meta = fromOpts ?? fromOverrides;
          const rk = meta?.reasonId?.trim();
          if (!rk) {
            setDamageSaveError("Brak powodu odrzucenia dla zapisu.");
            return false;
          }
          const noteTrim =
            rk === WMS_REJECT_OTHER_ID
              ? String(meta?.otherText ?? ovLine?.rejectReasonOtherText ?? "").trim()
              : "";
          if (rk === WMS_REJECT_OTHER_ID && !noteTrim) {
            setDamageSaveError("Uzupełnij uzasadnienie (wymagane przy „Inny powód”).");
            return false;
          }
          ret = await processWmsReturnLine(
            effectiveReturnDbId,
            seed.orderItemId,
            DAMAGE_TENANT_ID,
            {
              decision: "REJECTED",
              damage_type: rk,
              ...(rk === WMS_REJECT_OTHER_ID ? { note: noteTrim } : {}),
            },
            { commitWorkflow, warehouseId: Number(whId) },
          );
        } else if (allOkLine) {
          ret = await processWmsReturnLine(
            effectiveReturnDbId,
            seed.orderItemId,
            DAMAGE_TENANT_ID,
            {
              decision: "OK",
              condition: "A",
            },
            { commitWorkflow, warehouseId: Number(whId) },
          );
        } else {
          const splitCondition: "A" | "B" | "C" | null =
            aggregated.damaged > 0
              ? aggregated.damagedC > 0
                ? "C"
                : "B"
              : aggregated.accepted > 0
                ? "A"
                : null;

          const rejMeta =
            opts?.rejectReasonForSplit ??
            opts?.fullLineRejectReason ??
            (lineOverrides[lineId]?.rejectReasonId != null &&
            String(lineOverrides[lineId]!.rejectReasonId).trim() !== ""
              ? {
                  reasonId: String(lineOverrides[lineId]!.rejectReasonId).trim(),
                  otherText:
                    lineOverrides[lineId]!.rejectReasonId === WMS_REJECT_OTHER_ID
                      ? lineOverrides[lineId]!.rejectReasonOtherText ?? undefined
                      : undefined,
                }
              : null);

          let splitDamageType: string | null = null;
          if (damage_entries.length === 0 && aggregated.damaged > 0) {
            splitDamageType = encodedDamageTypes || null;
          }
          if (aggregated.rejected > 0 && rejMeta?.reasonId?.trim()) {
            const enc = encodeRejectReasonForSplitPayload(rejMeta.reasonId.trim(), rejMeta.otherText ?? null);
            splitDamageType = splitDamageType ? `${splitDamageType} | reject:${enc}` : `reject:${enc}`;
          }

          const payload = {
            product_id: seed.candidate.productId,
            accepted_qty: aggregated.accepted,
            damaged_qty: aggregated.damaged,
            damaged_b_qty: aggregated.damagedB,
            damaged_c_qty: aggregated.damagedC,
            rejected_qty: aggregated.rejected,
            condition: splitCondition,
            photo_urls: allDamagePhotoUrls,
            damage_type: splitDamageType,
            ...(damage_entries.length > 0 ? { damage_entries } : {}),
          };
          if (aggregated.damaged > 0 && damage_entries.length < 1) {
            setDamageSaveError("Brak damage_entries dla uszkodzonych sztuk — zapis został zablokowany.");
            return false;
          }
          console.log("[WMS RMZ] split-process submit", {
            returnId: effectiveReturnDbId,
            orderItemId: seed.orderItemId,
            lineId,
            aggregated,
            damageEntries: damage_entries,
            splitPayload: payload,
          });
          ret = await processWmsReturnLineSplit(
            effectiveReturnDbId,
            seed.orderItemId,
            DAMAGE_TENANT_ID,
            payload,
            { commitWorkflow, warehouseId: Number(whId) },
          );
        }

        const lineAfterSave =
          ret.lines.find((l) => Number(l.order_item_id) === Number(seed.orderItemId)) ??
          ret.lines.find((l) => Number(l.product_id) === Number(seed.candidate.productId));
        console.log("[WMS RMZ] split-process response line", {
          lineId,
          orderItemId: seed.orderItemId,
          productId: seed.candidate.productId,
          returnedDamageEntries: lineAfterSave?.damage_entries ?? [],
          returnedDamagedQty: lineAfterSave?.damaged_qty ?? null,
          returnedDamagedBQty: lineAfterSave?.damaged_b_qty ?? null,
          returnedDamagedCQty: lineAfterSave?.damaged_c_qty ?? null,
        });

        setGridDamagedOpenByLineId((prev) => ({ ...prev, [lineId]: false }));
        if (hydrate) {
          setWmsReturn(ret);
          setDirtyLineIds((prev) => {
            const n = { ...prev };
            delete n[lineId];
            return n;
          });
          setLineOverrides((prev) => {
            const n = { ...prev };
            delete n[lineId];
            return n;
          });
          window.dispatchEvent(new Event("wms-returns-list-refresh"));
        }
        return true;
      } catch (e) {
        console.error("WMS split line save failed:", e);
        if (axios.isAxiosError(e)) {
          console.log("SPLIT BACKEND ERROR BODY", e.response?.data);
        }
        setDamageSaveError("Nie udało się zapisać podziału ilości.");
        return false;
      } finally {
        setSavingSplitByLineId((prev) => ({ ...prev, [lineId]: false }));
      }
    },
    [
      isFinished,
      selectedReturnDbId,
      wmsReturn?.id,
      lineSeedByLineId,
      wmsReturn?.warehouse_id,
      wmsReturn?.status,
      wmsReturn?.workflow_finished,
      wmsReturn?.workflow_editable,
      unitRowsByLineId,
      rid,
      lineOverrides,
      dmgReasons,
    ]
  );
  saveSplitForLineRef.current = saveSplitForLine;

  const fullRefundAmount = useMemo(
    () =>
      lineSeeds.reduce((sum, s) => {
        const rows = unitRowsByLineId[s.lineId] ?? [];
        const acceptedCount = rows.filter((r) => r.decision === "ACCEPTED").length;
        return sum + s.unitPrice * acceptedCount;
      }, 0),
    [lineSeeds, unitRowsByLineId]
  );

  useEffect(() => {
    if (displayLines.length === 0) {
      setActiveLineId(null);
      return;
    }
    if (activeLineId == null || !displayLines.some((l) => l.lineId === activeLineId)) {
      setActiveLineId(displayLines[0]!.lineId);
    }
  }, [displayLines, activeLineId]);

  const activeLine = useMemo(
    () => (activeLineId ? displayLines.find((l) => l.lineId === activeLineId) ?? null : null),
    [displayLines, activeLineId]
  );

  useEffect(() => {
    if (!highlightCardLineId) return;
    const el = document.getElementById(`rmz-grid-card-${highlightCardLineId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => setHighlightCardLineId(null), 1400);
    return () => window.clearTimeout(t);
  }, [highlightCardLineId]);

  useEffect(() => {
    if (!phoneUploadSession || isFinished) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await wmsPhotoUploadClient.get(
          `/wms/photo-upload/session/${encodeURIComponent(phoneUploadSession.sessionId)}`,
          { params: { tenant_id: DAMAGE_TENANT_ID } },
        );
        if (cancelled) return;
        const urls = extractSessionPhotoUrls(res.data);
        const seen = new Set(phoneUploadSession.seenUrls);
        const fresh = urls.filter((u) => !seen.has(u));
        if (fresh.length > 0) {
          const dl = damageLineRef.current;
          const modalTargetsThisLine = dl != null && dl.lineId === phoneUploadSession.lineId;
          if (modalTargetsThisLine) {
            setDamageFiles((prev) => {
              const merged = [...prev];
              for (const u of fresh) {
                const norm = coercePhotoUrlForDamageEntry(u) ?? u;
                if (merged.some((p) => p.preview === norm)) continue;
                merged.push(newDamagePhoto(norm, `phone-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`));
              }
              damageEvidenceUrlsRef.current = persistedUrlsFromDamageFiles(merged);
              return merged;
            });
          } else {
            const flow = gridDamagedFlowRef.current;
            const lid = phoneUploadSession.lineId;
            const useDraft =
              phoneUploadSession.unitIndex === 0 && flow.mode[lid] === "damaged" && flow.open[lid];
            if (useDraft) {
              setGridDamageDraftByLineId((prev) => {
                const d = prev[lid] ?? EMPTY_GRID_DAMAGE_DRAFT;
                const merged = [...d.photoUrls];
                for (const u of fresh) {
                  const norm = coercePhotoUrlForDamageEntry(u) ?? u;
                  if (norm && !merged.includes(norm)) merged.push(norm);
                }
                const capped = merged.slice(0, MAX_DAMAGE_PHOTOS);
                return { ...prev, [lid]: { ...d, photoUrls: capped } };
              });
              setDirtyLineIds((prev) => ({ ...prev, [lid]: true }));
            } else {
              setUnitRowsByLineId((prev) => {
                const rows = [...(prev[phoneUploadSession.lineId] ?? [])];
                if (!rows[phoneUploadSession.unitIndex]) return prev;
                rows[phoneUploadSession.unitIndex] = {
                  ...rows[phoneUploadSession.unitIndex],
                  photoUrls: [...rows[phoneUploadSession.unitIndex].photoUrls, ...fresh],
                };
                return { ...prev, [phoneUploadSession.lineId]: rows };
              });
              setDirtyLineIds((prev) => ({ ...prev, [phoneUploadSession.lineId]: true }));
            }
          }
          setPhoneUploadSession((prev) => (prev ? { ...prev, seenUrls: Array.from(new Set([...prev.seenUrls, ...fresh])) } : prev));
        }
      } catch {
        // Keep polling silently; user can close modal.
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, 2000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phoneUploadSession, isFinished, extractSessionPhotoUrls]);



  const pendingAllLines = useMemo(() => allLines.filter((l) => l.systemStatus === "PENDING"), [allLines]);

  const displayLinesRef = useRef(displayLines);
  displayLinesRef.current = displayLines;

  const okBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dmgBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rejBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusLineCol = useCallback((lineIdx: number, col: 0 | 1 | 2) => {
    const refObj = [okBtnRefs, dmgBtnRefs, rejBtnRefs][col];
    window.requestAnimationFrame(() => {
      refObj.current[lineIdx]?.focus();
    });
  }, []);

  const onLineActionKeyDown = useCallback(
    (e: React.KeyboardEvent, lineIdx: number, col: 0 | 1 | 2) => {
      const lines = displayLinesRef.current;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (lineIdx < lines.length - 1) focusLineCol(lineIdx + 1, col);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (lineIdx > 0) focusLineCol(lineIdx - 1, col);
      }
    },
    [focusLineCol],
  );

  const gridInitialFocusKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (damageLine != null || sessionLoading || gridLoading || displayLines.length === 0 || !wmsReturn) return;
    const key = `${rid}:${wmsReturn.id}:${displayLines.length}`;
    if (gridInitialFocusKey.current === key) return;
    gridInitialFocusKey.current = key;
    const pi = displayLines.findIndex((l) => l.systemStatus === "PENDING");
    window.requestAnimationFrame(() => {
      okBtnRefs.current[pi >= 0 ? pi : 0]?.focus();
    });
  }, [damageLine, sessionLoading, gridLoading, displayLines, wmsReturn, rid]);

  const prevDamageLineRef = useRef<ReturnLineModel | null>(null);
  useLayoutEffect(() => {
    const was = prevDamageLineRef.current;
    prevDamageLineRef.current = damageLine;
    if (damageLine != null || was == null) return;
    if (sessionLoading || gridLoading || displayLines.length === 0) return;
    const pi = displayLines.findIndex((l) => l.systemStatus === "PENDING");
    if (pi < 0) return;
    window.requestAnimationFrame(() => okBtnRefs.current[pi]?.focus());
  }, [damageLine, sessionLoading, gridLoading, displayLines]);

  useEffect(() => {
    gridInitialFocusKey.current = null;
  }, [rid]);

  /** Chain damage modal for “wszystkie uszkodzone”. */

  useEffect(() => {

    if (!damageMassMode || damageLine != null) return;

    const pending = allLines.filter((l) => l.systemStatus === "PENDING");

    if (pending.length === 0) {

      setDamageMassMode(false);

      return;

    }

    setDamageLine(pending[0]);

    setDamageQuantity(Math.max(1, Math.floor(pending[0].candidate.availableQuantity)));

    setDamageFiles([]);
    damageEvidenceUrlsRef.current = [];
    setIsUploadingPhotos(false);

    setDamageModalTypeIds([]);
    setDamageConditionChoice(null);

  }, [damageMassMode, damageLine, allLines]);



  useEffect(() => {

    if (!damageLine) return;

    const max = Math.floor(damageLine.candidate.availableQuantity);

    setDamageQuantity((q) => Math.min(Math.max(1, q), Math.max(1, max)));

  }, [damageLine]);



  const massAcceptAll = () => {
    if (isFinished) return;
    if (selectedReturnDbId == null) {
      setDamageSaveError("Brak identyfikatora zwrotu — odśwież stronę lub otwórz dokument ponownie.");
      return;
    }
    void (async () => {
      try {
        for (const ln of pendingAllLines) {
          applyLinePatch(ln.lineId, { systemStatus: "OK" });
          const oi = lineSeedByLineId.get(ln.lineId)?.orderItemId;
          if (oi == null || !Number.isFinite(Number(oi))) continue;
          await processWmsReturnLine(selectedReturnDbId, Number(oi), DAMAGE_TENANT_ID, { decision: "OK", condition: "A" });
        }
        const updated = await getWmsReturn(selectedReturnDbId, DAMAGE_TENANT_ID);
        setWmsReturn(updated);
        setLineOverrides({});
      } catch (e) {
        console.error("massAcceptAll failed:", e);
        setDamageSaveError("Nie udało się zapisać decyzji zbiorczo.");
      }
    })();
  };



  const massRejectAll = () => {
    if (isFinished) return;
    if (selectedReturnDbId == null) {
      setDamageSaveError("Brak identyfikatora zwrotu — odśwież stronę lub otwórz dokument ponownie.");
      return;
    }
    void (async () => {
      try {
        for (const ln of pendingAllLines) {
          applyLinePatch(ln.lineId, { systemStatus: "REJECTED", rejectReasonId: "mass_reject" });
          const oi = lineSeedByLineId.get(ln.lineId)?.orderItemId;
          if (oi == null || !Number.isFinite(Number(oi))) continue;
          await processWmsReturnLine(selectedReturnDbId, Number(oi), DAMAGE_TENANT_ID, {
            decision: "REJECTED",
            damage_type: "mass_reject",
          });
        }
        const updated = await getWmsReturn(selectedReturnDbId, DAMAGE_TENANT_ID);
        setWmsReturn(updated);
        setLineOverrides({});
      } catch (e) {
        console.error("massRejectAll failed:", e);
        setDamageSaveError("Nie udało się zapisać decyzji zbiorczo.");
      }
    })();
  };

  const massDamageAllOpen = () => {
    if (isFinished) return;
    if (pendingAllLines.length === 0) return;
    stopCamera();
    setDamageMassMode(true);
    setDamageSaveError(null);
    setIsUploadingPhotos(false);
    const first = pendingAllLines[0];
    setDamageLine(first);
    setDamageQuantity(Math.max(1, Math.floor(first.candidate.availableQuantity)));
    setDamageFiles([]);
    damageEvidenceUrlsRef.current = [];
    setDamageModalTypeIds([]);
    setDamageConditionChoice(null);
  };

  const openDamageForLine = (ln: ReturnLineModel) => {
    if (isFinished) return;
    stopCamera();
    setDamageMassMode(false);
    setDamageLine(ln);
    setDamageQuantity(Math.max(1, Math.floor(ln.candidate.availableQuantity)));
    setDamageFiles([]);
    damageEvidenceUrlsRef.current = [];
    setDamageModalTypeIds([]);
    setDamageConditionChoice(null);
    setDamageSaveError(null);
    setIsUploadingPhotos(false);
  };

  const closeDamageModal = () => {
    if (damageSaving || isUploadingPhotos) return;
    stopCamera();
    setDamageLine(null);
    setDamageMassMode(false);
    setDamageFiles([]);
    damageEvidenceUrlsRef.current = [];
    setDamageConditionChoice(null);
    setDamageModalTypeIds([]);
    setDamageSaveError(null);
    setIsUploadingPhotos(false);
  };



  const addDamageFiles = async (files: FileList | null) => {
    if (isFinished) return;
    if (!files?.length) return;
    const remaining = MAX_DAMAGE_PHOTOS - damageFiles.length;
    if (remaining <= 0) {
      setDamageSaveError(`Możesz dodać maks. ${MAX_DAMAGE_PHOTOS} zdjęć.`);
      return;
    }
    const imageFiles = Array.from(files).filter((f) => isProbablyImageFile(f));
    if (imageFiles.length === 0) {
      setDamageSaveError("Wybierz plik graficzny (np. JPG, PNG, HEIC, WEBP).");
      return;
    }

    setIsUploadingPhotos(true);
    try {
      const next: DamagePhotoItem[] = [];
      for (const f of imageFiles) {
        if (next.length >= remaining) break;
        try {
          const path = await uploadDamageImageFile(f);
          const normalized = coercePhotoUrlForDamageEntry(path) ?? path;
          next.push(newDamagePhoto(normalized, f.name));
        } catch (e) {
          console.error(
            "[wms damage] POST /api/uploads (file) failed",
            axios.isAxiosError(e) ? e.response?.data ?? e.message : e
          );
          setDamageSaveError("Nie udało się wysłać zdjęcia na serwer.");
          return;
        }
      }
      if (next.length === 0) {
        setDamageSaveError("Nie udało się dodać żadnego pliku (limit lub błąd przesyłania).");
        return;
      }
      setDamageFiles((prev) => {
        const merged = [...prev, ...next];
        damageEvidenceUrlsRef.current = persistedUrlsFromDamageFiles(merged);
        return merged;
      });
      setDamageSaveError(imageFiles.length > next.length ? `Dodano tylko część plików — limit ${MAX_DAMAGE_PHOTOS} zdjęć.` : null);
    } finally {
      setIsUploadingPhotos(false);
    }
  };



  const handleSaveDamage = async () => {
    if (isFinished) return;
    console.log("SAVE CLICKED");

    if (!damageLine) {
      console.warn("Blocked save:", "no active damage line");
      return;
    }
    if (damageSaving) {
      console.warn("Blocked save:", "save already in progress");
      return;
    }
    if (isUploadingPhotos) {
      console.warn("Blocked save: upload in progress");
      setDamageSaveError("Poczekaj na zakończenie wysyłania zdjęcia.");
      return;
    }

    setDamageSaving(true);
    setDamageSaveError(null);
    const requirePhotos = !!wmsSettings?.require_photos;
    const requireCondition = !!wmsSettings?.require_condition;

    try {
      await new Promise((r) => setTimeout(r, 0));

      if (requireCondition && damageConditionChoice !== "B" && damageConditionChoice !== "C") {
        setDamageSaveError("Wybierz klasę uszkodzenia (B lub C).");
        return;
      }

      if (damageConditionChoice === "B" || damageConditionChoice === "C") {
        const modalTypes = filterRmzDamageTypeIdsForClass(damageConditionChoice, damageModalTypeIds, dmgReasons);
        if (modalTypes.length < 1) {
          setDamageSaveError("Wybierz co najmniej jeden typ uszkodzenia.");
          return;
        }
      }

      const fromLocalRaw = [...new Set([...damageEvidenceUrlsRef.current, ...persistedUrlsFromDamageFiles(damageFiles)])];
      const fromLocal = fromLocalRaw.map((u) => coercePhotoUrlForDamageEntry(u)).filter((x): x is string => x != null);
      const photo_urls = [...new Set(fromLocal)].slice(0, MAX_DAMAGE_PHOTOS);
      if (photo_urls.length === 0 && requirePhotos) {
        setDamageSaveError("Dodaj zdjęcie");
        return;
      }

      const max = Math.floor(damageLine.candidate.availableQuantity);
      const qty = Math.min(Math.max(1, damageQuantity), Math.max(1, max));

      const modalDamagePayload =
        damageConditionChoice === "B" || damageConditionChoice === "C"
          ? encodeRmzDamageTypePayload(
              filterRmzDamageTypeIdsForClass(damageConditionChoice, damageModalTypeIds, dmgReasons),
              dmgReasons,
            )
          : "";
      const damageTypeForApis = modalDamagePayload || "other";

      const damageWhId = wmsReturn?.warehouse_id;
      if (damageWhId == null || !Number.isFinite(Number(damageWhId))) {
        setDamageSaveError("Brak skonfigurowanego magazynu.");
        return;
      }

      if (photo_urls.length > 0) {
        try {
          await createDamageEntry({
            tenant_id: DAMAGE_TENANT_ID,
            warehouse_id: Number(damageWhId),
            product_id: damageLine.candidate.productId,
            quantity: qty,
            photo_urls,
            damage_type: damageTypeForApis,
            created_by: createdBy.trim() || undefined,
          });
        } catch (e: unknown) {
          console.error("SAVE DAMAGE ERROR", axios.isAxiosError(e) ? e.response?.data ?? e : e);
          console.warn("Blocked save:", "createDamageEntry rejected");
          setDamageSaveError(formatDamageSaveApiError(e));
          return;
        }
      }

      const lineId = damageLine.lineId;
      const orderItemId = lineSeedByLineId.get(lineId)?.orderItemId;
      if (orderItemId == null || !Number.isFinite(Number(orderItemId))) {
        setDamageSaveError("Nie można ustalić numeru pozycji zwrotu.");
        return;
      }

      const processPayload: WmsReturnLineProcess = {
        decision: "DAMAGED",
        damage_type: damageTypeForApis,
        ...(photo_urls.length > 0 ? { photo_urls } : {}),
        ...(requireCondition && damageConditionChoice ? { condition: damageConditionChoice } : {}),
      };

      if (selectedReturnDbId == null) {
        setDamageSaveError("Brak identyfikatora zwrotu — odśwież stronę lub otwórz dokument ponownie.");
        return;
      }
      const updated = await processWmsReturnLine(selectedReturnDbId, Number(orderItemId), DAMAGE_TENANT_ID, processPayload);
      setWmsReturn(updated);
      setLineOverrides({});

      stopCamera();
      setDamageLine(null);
      setDamageMassMode(false);
      setDamageFiles([]);
      damageEvidenceUrlsRef.current = [];
      setDamageSaveError(null);
    } catch (e: unknown) {
      console.error("SAVE DAMAGE ERROR", axios.isAxiosError(e) ? e.response?.data ?? e : e);
      console.warn("Blocked save:", "unexpected error in handleSaveDamage");
      setDamageSaveError(formatDamageSaveApiError(e));
    } finally {
      setDamageSaving(false);
    }
  };



  const massDisabled = pendingAllLines.length === 0;

  const okCount = allLines.filter((l) => l.systemStatus === "OK").length;
  const damagedCount = allLines.filter((l) => l.systemStatus === "DAMAGED").length;
  const rejectedCount = allLines.filter((l) => l.systemStatus === "REJECTED").length;
  const hasChanges = Object.keys(dirtyLineIds).length > 0;

  const validateLineSplitForSave = useCallback(
    (lineId: string): { ok: true } | { ok: false; message: string } => {
      const seed = lineSeedByLineId.get(lineId);
      if (!seed) return { ok: false, message: "Nie udało się ustalić pozycji do zapisu." };
      const total = Math.max(0, Math.floor(seed.candidate.availableQuantity));
      const rows = unitRowsByLineId[lineId] ?? [];
      if (rows.length !== total) {
        return { ok: false, message: "Niezgodna liczba wierszy jednostek." };
      }
      const slice = rows.slice(0, total);
      const resolvedCells = slice.filter((r) => r.decision != null).length;
      if (resolvedCells < 1) {
        return { ok: false, message: "Zapisz co najmniej jedną rozstrzygniętą sztukę." };
      }
      for (let i = 0; i < slice.length; i += 1) {
        const r = slice[i]!;
        if (r.decision == null) continue;
        if (r.decision === "DAMAGED") {
          if (filterRmzDamageTypeIdsForClass(r.damageClass, r.damageTypeIds).length < 1) {
            return {
              ok: false,
              message: "Dla każdej uszkodzonej sztuki wybierz co najmniej jeden typ uszkodzenia.",
            };
          }
        }
      }
      const accepted = slice.filter((r) => r.decision === "ACCEPTED").length;
      const damagedRows = slice.filter((r) => r.decision === "DAMAGED");
      const damaged = damagedRows.length;
      const rejected = slice.filter((r) => r.decision === "REJECTED").length;
      const resolvedSum = accepted + damaged + rejected;
      if (resolvedSum > total) {
        return { ok: false, message: "Łącznie rozstrzygniętych sztuk nie może przekraczać ilości pozycji." };
      }
      const damagedB = damagedRows.filter((r) => r.damageClass === "B").length;
      const damagedC = damagedRows.filter((r) => r.damageClass === "C").length;
      const classesOk = damagedB + damagedC === damaged;
      if (!classesOk) return { ok: false, message: "Niezgodny podział klas uszkodzenia (B/C)." };

      if (rejected > 0) {
        const rr = lineOverrides[lineId]?.rejectReasonId;
        if (rr == null || String(rr).trim() === "") {
          return {
            ok: false,
            message: "Wskaż, dlaczego odrzucasz zwrot — wymagane dla linii z odrzuconymi sztukami.",
          };
        }
        if (rr === WMS_REJECT_OTHER_ID) {
          const other = (lineOverrides[lineId]?.rejectReasonOtherText ?? "").trim();
          if (!other) {
            return {
              ok: false,
              message: "Uzupełnij uzasadnienie (wymagane przy wyborze „Inny powód”).",
            };
          }
        }
      }
      return { ok: true };
    },
    [lineSeedByLineId, unitRowsByLineId, lineOverrides]
  );

  const isLineFullyResolved = useCallback(
    (lineId: string): boolean => {
      const seed = lineSeedByLineId.get(lineId);
      if (!seed) return false;
      const total = Math.max(0, Math.floor(seed.candidate.availableQuantity));
      if (total < 1) return true;
      const rows = unitRowsByLineId[lineId] ?? [];
      if (rows.length !== total) return false;
      return rows.slice(0, total).every((r) => r.decision != null);
    },
    [lineSeedByLineId, unitRowsByLineId],
  );

  const allLinesFullyResolved = useMemo(() => {
    if (lineSeeds.length < 1) return false;
    return lineSeeds.every((s) => isLineFullyResolved(s.lineId));
  }, [lineSeeds, isLineFullyResolved]);

  const damagedUnitsMissingPhotos = useMemo(() => {
    let missing = 0;
    for (const s of lineSeeds) {
      const rows = unitRowsByLineId[s.lineId] ?? [];
      for (const r of rows) {
        if (r.decision === "DAMAGED" && r.photoUrls.length < 1) missing += 1;
      }
    }
    return missing;
  }, [lineSeeds, unitRowsByLineId]);

  const buildFinalizeLinePayload = useCallback(
    (
      lineId: string,
    ): { ok: true; line: import("../../types/wmsReturn").WmsReturnFinalizeLineIn } | { ok: false; message: string } => {
      const seed = lineSeedByLineId.get(lineId);
      if (!seed) return { ok: false, message: "Brak danych pozycji — odśwież widok." };
      const total = Math.max(0, Math.floor(seed.candidate.availableQuantity));
      const rows = unitRowsByLineId[lineId] ?? [];
      if (rows.length !== total) {
        return { ok: false, message: "Niezgodna liczba wierszy jednostek — odśwież widok." };
      }
      const slice = rows.slice(0, total);
      for (let i = 0; i < slice.length; i += 1) {
        const r = slice[i]!;
        if (r.decision == null) continue;
        if (r.decision === "DAMAGED") {
          if (filterRmzDamageTypeIdsForClass(r.damageClass, r.damageTypeIds, dmgReasons).length < 1) {
            return {
              ok: false,
              message: "Dla każdej uszkodzonej sztuki wybierz co najmniej jeden typ uszkodzenia.",
            };
          }
        }
      }
      const accepted = slice.filter((r) => r.decision === "ACCEPTED").length;
      const damagedRows = slice.filter((r) => r.decision === "DAMAGED");
      const rejected = slice.filter((r) => r.decision === "REJECTED").length;
      const allDamagePhotoUrls = [...new Set(damagedRows.flatMap((r) => r.photoUrls))];
      const aggregated = {
        accepted,
        damaged: damagedRows.length,
        damagedB: damagedRows.filter((r) => r.damageClass === "B").length,
        damagedC: damagedRows.filter((r) => r.damageClass === "C").length,
        rejected,
      };
      const resolvedSum = aggregated.accepted + aggregated.damaged + aggregated.rejected;
      if (resolvedSum < total) {
        return { ok: false, message: "Nie wszystkie sztuki pozycji są rozstrzygnięte." };
      }
      if (rejected > 0) {
        const ovLine = lineOverrides[lineId];
        const rk =
          ovLine?.rejectReasonId != null && String(ovLine.rejectReasonId).trim() !== ""
            ? String(ovLine.rejectReasonId).trim()
            : "";
        if (!rk) {
          return { ok: false, message: "Brak powodu odrzucenia dla zapisu." };
        }
        const noteTrim =
          rk === WMS_REJECT_OTHER_ID ? String(ovLine?.rejectReasonOtherText ?? "").trim() : "";
        if (rk === WMS_REJECT_OTHER_ID && !noteTrim) {
          return { ok: false, message: "Uzupełnij uzasadnienie (wymagane przy „Inny powód”)." };
        }
      }
      const encodedDamageTypes = mergeRmzDamageTypePayloadFromUnits(
        slice.map((r) => ({ decision: r.decision, damageTypeIds: r.damageTypeIds })),
        dmgReasons,
      );
      if (aggregated.damagedB + aggregated.damagedC !== aggregated.damaged) {
        return { ok: false, message: "Niezgodny podział klas uszkodzenia (B/C)." };
      }
      const damage_entries =
        aggregated.damaged > 0 ? buildDamageEntriesForSplitPayload(slice, dmgReasons) : [];
      const splitCondition: "A" | "B" | "C" | null =
        aggregated.damaged > 0
          ? aggregated.damagedC > 0
            ? "C"
            : "B"
          : aggregated.accepted > 0
            ? "A"
            : null;
      let splitDamageType: string | null = null;
      if (damage_entries.length === 0 && aggregated.damaged > 0) {
        splitDamageType = encodedDamageTypes || null;
      }
      if (aggregated.rejected > 0) {
        const ovLine = lineOverrides[lineId];
        const rk =
          ovLine?.rejectReasonId != null && String(ovLine.rejectReasonId).trim() !== ""
            ? String(ovLine.rejectReasonId).trim()
            : "";
        if (rk) {
          const enc = encodeRejectReasonForSplitPayload(
            rk,
            rk === WMS_REJECT_OTHER_ID ? ovLine?.rejectReasonOtherText ?? null : null,
          );
          splitDamageType = splitDamageType ? `${splitDamageType} | reject:${enc}` : `reject:${enc}`;
        }
      }
      if (aggregated.damaged > 0 && damage_entries.length < 1) {
        return { ok: false, message: "Brak damage_entries dla uszkodzonych sztuk — zapis został zablokowany." };
      }
      return {
        ok: true,
        line: {
          order_item_id: seed.orderItemId,
          product_id: seed.candidate.productId,
          accepted_qty: aggregated.accepted,
          damaged_qty: aggregated.damaged,
          damaged_b_qty: aggregated.damagedB,
          damaged_c_qty: aggregated.damagedC,
          rejected_qty: aggregated.rejected,
          condition: splitCondition,
          photo_urls: allDamagePhotoUrls,
          damage_type: splitDamageType,
          ...(damage_entries.length > 0 ? { damage_entries } : {}),
        },
      };
    },
    [lineSeedByLineId, unitRowsByLineId, lineOverrides, dmgReasons],
  );

  const handleSaveDirtyLines = useCallback(async () => {
    if (isFinished) return;
    if (!allLinesFullyResolved) return;
    if (saveChangesLoading) return;
    if (selectedReturnDbId == null) {
      setDamageSaveError("Brak identyfikatora zwrotu — odśwież stronę lub otwórz dokument ponownie.");
      return;
    }

    if (damagedUnitsMissingPhotos > 0) {
      if (wmsSettings?.require_photos) {
        setDamageSaveError("Dodaj zdjęcie uszkodzenia dla wszystkich uszkodzonych sztuk.");
        return;
      }
      const proceed = window.confirm(
        "Nie dodano zdjęcia uszkodzenia dla co najmniej jednej sztuki. Kontynuować?",
      );
      if (!proceed) return;
    }

    const orderIdForList = wmsReturn?.order_id;
    const whId = wmsReturn?.warehouse_id;

    console.log("[returns.finalize.start]", selectedReturnDbId);
    setDamageSaveError(null);
    setSaveChangesLoading(true);
    try {
      const lineIdsToSave = lineSeeds.map((s) => s.lineId).filter((lineId) => isLineFullyResolved(lineId));

      for (const lineId of lineIdsToSave) {
        const v = validateLineSplitForSave(lineId);
        if (!v.ok) {
          setDamageSaveError(v.message);
          return;
        }
      }

      const finalizeLines: import("../../types/wmsReturn").WmsReturnFinalizeLineIn[] = [];
      for (const lineId of lineIdsToSave) {
        const built = buildFinalizeLinePayload(lineId);
        if (!built.ok) {
          setDamageSaveError(built.message);
          return;
        }
        finalizeLines.push(built.line);
      }

      const amt = fullRefundAmount;
      const shipAmt = refundShipping ? refundShippingAmount : 0;
      const enableRefund = Boolean(wmsSettings?.enable_refund);
      const finalReturn = await finalizeWmsReturn(
        selectedReturnDbId,
        DAMAGE_TENANT_ID,
        {
          lines: finalizeLines,
          process_refund: enableRefund,
          refund: enableRefund
            ? {
                refund_type: amt > 0 || (refundShipping && shipAmt > 0) ? "PARTIAL" : "NONE",
                refund_amount: Number.isFinite(amt) && amt > 0 ? amt : null,
                refund_shipping: refundShipping,
                refund_shipping_amount:
                  refundShipping && Number.isFinite(shipAmt) && shipAmt > 0 ? shipAmt : null,
                decided_by: "wms_operator",
              }
            : null,
        },
        whId != null && Number.isFinite(Number(whId)) ? Number(whId) : null,
      );

      for (const lineId of lineIdsToSave) {
        const built = buildFinalizeLinePayload(lineId);
        if (!built.ok) continue;
        const seed = lineSeedByLineId.get(lineId);
        if (seed && built.line.damaged_qty > 0 && whId != null) {
          const rows = unitRowsByLineId[lineId] ?? [];
          const damagedRows = rows.filter((r) => r.decision === "DAMAGED");
          const allDamagePhotoUrls = [...new Set(damagedRows.flatMap((r) => r.photoUrls))];
          if (allDamagePhotoUrls.length > 0) {
            const encodedDamageTypes = mergeRmzDamageTypePayloadFromUnits(
              rows.map((r) => ({ decision: r.decision, damageTypeIds: r.damageTypeIds })),
              dmgReasons,
            );
            try {
              await createDamageEntry({
                tenant_id: DAMAGE_TENANT_ID,
                warehouse_id: Number(whId),
                product_id: seed.candidate.productId,
                quantity: built.line.damaged_qty,
                photo_urls: allDamagePhotoUrls,
                damage_type: encodedDamageTypes || "other",
              });
            } catch {
              /* RMZ finalize succeeded; damage module entry is best-effort */
            }
          }
        }
      }

      setLineOverrides({});
      setDirtyLineIds({});
      setGridUnlockEditByLineId({});
      setDamageSaveError(null);

      try {
        window.dispatchEvent(new Event("wms-returns-list-refresh"));
      } catch {
        /* ignore */
      }

      const returnIdForHighlight =
        finalReturn.id != null && Number.isFinite(Number(finalReturn.id)) && Number(finalReturn.id) > 0
          ? Math.floor(Number(finalReturn.id))
          : null;
      const orderIdForNav =
        orderIdForList != null && Number.isFinite(Number(orderIdForList)) && Number(orderIdForList) > 0
          ? Math.floor(Number(orderIdForList))
          : null;

      try {
        const docNo = displayWarehouseDocumentNumber(finalReturn.warehouse_document_number);
        const toastMsg = docNo
          ? `Zwrot zakończony. Utworzono dokument ${docNo}`
          : "Zwrot zakończony";
        toast.success(toastMsg);
      } catch {
        toast.success("Zwrot zakończony");
      }

      navigate(WMS_ROUTES.returns, {
        replace: true,
        state:
          orderIdForNav != null
            ? {
                preselectOrderId: orderIdForNav,
                ...(returnIdForHighlight != null ? { highlightReturnId: returnIdForHighlight } : {}),
              }
            : undefined,
      });
    } catch (e) {
      console.error("[returns.finalize] failed", e);
      setDamageSaveError(formatDamageSaveApiError(e) || "Nie udało się zapisać zwrotu");
    } finally {
      setSaveChangesLoading(false);
    }
  }, [
    isFinished,
    allLinesFullyResolved,
    saveChangesLoading,
    selectedReturnDbId,
    damagedUnitsMissingPhotos,
    wmsSettings?.require_photos,
    wmsSettings?.enable_refund,
    lineSeeds,
    isLineFullyResolved,
    validateLineSplitForSave,
    buildFinalizeLinePayload,
    lineSeedByLineId,
    unitRowsByLineId,
    dmgReasons,
    fullRefundAmount,
    refundShipping,
    refundShippingAmount,
    wmsReturn?.order_id,
    wmsReturn?.warehouse_id,
    navigate,
  ]);

  const savePanelReturnUiStatus = useCallback(async () => {
    if (isFinished || selectedReturnDbId == null || wmsReturn?.warehouse_id == null) return;
    setPanelUiStatusSaving(true);
    setDamageSaveError(null);
    try {
      const raw = pendingPanelUiSubStatusId === "" ? NaN : Number(pendingPanelUiSubStatusId);
      const nextId = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
      const cur = wmsReturn.ui_status?.id ?? null;
      if (nextId === cur) return;
      const updated = await patchReturnRmzUiStatus(
        selectedReturnDbId,
        DAMAGE_TENANT_ID,
        nextId,
        wmsReturn.warehouse_id,
      );
      setWmsReturn(updated);
      window.dispatchEvent(new Event("wms-returns-list-refresh"));
    } catch (e) {
      setDamageSaveError(formatDamageSaveApiError(e));
    } finally {
      setPanelUiStatusSaving(false);
    }
  }, [isFinished, selectedReturnDbId, wmsReturn, pendingPanelUiSubStatusId]);

  const panelUiStatusSaveDisabled = useMemo(() => {
    if (!wmsReturn) return true;
    const raw = pendingPanelUiSubStatusId === "" ? NaN : Number(pendingPanelUiSubStatusId);
    const nextId = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
    const cur = wmsReturn.ui_status?.id ?? null;
    return nextId === cur;
  }, [wmsReturn, pendingPanelUiSubStatusId]);

  const firstName = (wmsReturn as { first_name?: string | null } | null)?.first_name ?? null;
  const lastName = (wmsReturn as { last_name?: string | null } | null)?.last_name ?? null;
  const customerFromReturn = [firstName, lastName].filter((x) => x != null && String(x).trim() !== "").join(" ").trim();
  const orderSourceDisplay = (wmsReturn as { source?: string | null } | null)?.source ?? "—";
  const salesDocumentNumber = (wmsReturn as { sales_document_number?: string | null } | null)?.sales_document_number ?? null;
  const cr = wmsReturn as {
    phone?: string | null;
    customer_phone?: string | null;
    email?: string | null;
    customer_email?: string | null;
  } | null;
  const headerPhoneRaw = cr?.phone ?? cr?.customer_phone ?? null;
  const headerEmailRaw = cr?.email ?? cr?.customer_email ?? null;
  const headerPhone = headerPhoneRaw != null && String(headerPhoneRaw).trim() !== "" ? String(headerPhoneRaw).trim() : null;
  const headerEmail = headerEmailRaw != null && String(headerEmailRaw).trim() !== "" ? String(headerEmailRaw).trim() : null;
  const totalUnits = useMemo(
    () => (wmsReturn?.lines ?? []).reduce((sum, ln) => sum + Math.max(0, Math.floor(Number(ln.quantity ?? 0) || 0)), 0),
    [wmsReturn?.lines],
  );

  const orderQtySumForFullReturn = useMemo(
    () => (orderDetailCached?.items ?? []).reduce((s, it) => s + Math.max(0, Math.floor(Number(it.quantity) || 0)), 0),
    [orderDetailCached?.items],
  );

  const returnedQtySumForFullReturn = useMemo(
    () => lineSeeds.reduce((s, seed) => s + Math.max(0, Math.floor(seed.candidate.availableQuantity)), 0),
    [lineSeeds],
  );

  const isFullReturn = useMemo(
    () => computeIsWmsFullReturn(orderQtySumForFullReturn, returnedQtySumForFullReturn),
    [orderQtySumForFullReturn, returnedQtySumForFullReturn],
  );

  const orderShippingRefundMeta = useMemo(
    () => resolveOrderShippingCostForRefund(orderDetailCached),
    [orderDetailCached],
  );

  useEffect(() => {
    if (!wmsReturn) return;
    const rid = wmsReturn.id;
    if (wmsReturn.refund != null) {
      setRefundShipping(!!wmsReturn.refund.refund_shipping);
      shippingRefundInitForReturnIdRef.current = rid;
      return;
    }
    if (!orderDetailCached?.items?.length) return;
    if (shippingRefundInitForReturnIdRef.current !== rid) {
      setRefundShipping(isFullReturn);
      shippingRefundInitForReturnIdRef.current = rid;
    }
  }, [wmsReturn, orderDetailCached?.items, isFullReturn]);

  useEffect(() => {
    const prev = prevIsFullReturnRef.current;
    if (prev === true && isFullReturn === false) {
      setRefundShipping(false);
    }
    prevIsFullReturnRef.current = isFullReturn;
  }, [isFullReturn]);

  useEffect(() => {
    if (isFinished) setShippingPartialConfirmOpen(false);
  }, [isFinished]);

  useEffect(() => {
    if (orderShippingRefundMeta.displayMissing) {
      setRefundShipping(false);
    }
  }, [orderShippingRefundMeta.displayMissing]);

  const headerOrderDisplay = useMemo(() => {
    const raw = (orderNumber || "").trim();
    if (raw) return raw.startsWith("#") ? raw : `#${raw}`;
    if (wmsReturn?.order_id != null) return `#${wmsReturn.order_id}`;
    return "—";
  }, [orderNumber, wmsReturn?.order_id]);

  const acceptAllLocal = useCallback(() => {
    if (isFinished) return;
    for (const ln of displayLines) {
      const seed = lineSeedByLineId.get(ln.lineId);
      const qty = Math.max(0, Math.floor(seed?.candidate.availableQuantity ?? 0));
      if (qty < 1) continue;
      const rows = unitRowsByLineId[ln.lineId] ?? [];
      const hasAnyDecision = rows.some((r) => r.decision != null);
      if (hasAnyDecision) continue;
      setAllUnitsDecisionForLine(ln.lineId, "ACCEPTED", false);
      applyLinePatch(ln.lineId, { systemStatus: "OK" });
    }
  }, [applyLinePatch, isFinished, displayLines, lineSeedByLineId, unitRowsByLineId, setAllUnitsDecisionForLine]);

  const runPrintReturnLine = useCallback(
    async (lineId: string) => {
      const seed = lineSeedByLineId.get(lineId);
      const rlid = seed?.rmzLineId;
      if (rlid == null || rlid <= 0) {
        setPrintLabelToast("Brak identyfikatora pozycji zwrotu — nie można wydrukować etykiety.");
        return;
      }
      try {
        await printReturnLabel(rlid, DAMAGE_TENANT_ID);
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          let msg = "Brak szablonu etykiety typu RETURN.";
          const raw = e.response.data;
          if (raw instanceof ArrayBuffer) {
            try {
              const t = new TextDecoder().decode(raw);
              const j = JSON.parse(t) as { detail?: unknown };
              if (typeof j.detail === "string" && j.detail.trim()) msg = j.detail.trim();
            } catch {
              /* ignore */
            }
          }
          setPrintLabelToast(msg);
          return;
        }
        setPrintLabelToast("Nie udało się wydrukować etykiety.");
      }
    },
    [lineSeedByLineId],
  );

  useEffect(() => {
    if (!printLabelToast) return;
    const t = window.setTimeout(() => setPrintLabelToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [printLabelToast]);

  const orderExternalIdForInsights = useMemo(() => {
    const raw = wmsReturn?.external_id;
    if (raw == null || String(raw).trim() === "") return null;
    return String(raw).trim();
  }, [wmsReturn?.external_id]);

  const customerHeaderLabel = (customerFromReturn || customerDisplay || "—").trim() || "—";

  useEffect(() => {
    if (!wmsReturn || sessionLoading) {
      setCustomerInsightsPeek(null);
      setCustomerInsightsPeekLoading(false);
      return;
    }
    const hasEmail = headerEmail != null && headerEmail.trim() !== "";
    const hasExt = orderExternalIdForInsights != null;
    if (!hasEmail && !hasExt) {
      setCustomerInsightsPeek(null);
      setCustomerInsightsPeekLoading(false);
      return;
    }
    let cancelled = false;
    setCustomerInsightsPeekLoading(true);
    void (async () => {
      try {
        const data = await getWmsCustomerInsights(DAMAGE_TENANT_ID, {
          email: hasEmail ? headerEmail : null,
          external_id: !hasEmail ? orderExternalIdForInsights : null,
        });
        if (!cancelled) setCustomerInsightsPeek(data);
      } catch {
        if (!cancelled) setCustomerInsightsPeek(null);
      } finally {
        if (!cancelled) setCustomerInsightsPeekLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wmsReturn?.id, sessionLoading, headerEmail, orderExternalIdForInsights]);

  useEffect(() => {
    if (!customerInsightsModalOpen) return;
    const hasEmail = headerEmail != null && headerEmail.trim() !== "";
    const hasExt = orderExternalIdForInsights != null;
    if (!hasEmail && !hasExt) {
      setCustomerInsightsLoading(false);
      setCustomerInsightsError("Brak adresu e-mail i zewnętrznego ID zamówienia — nie można wczytać statystyk.");
      setCustomerInsightsData(null);
      return;
    }
    let cancelled = false;
    setCustomerInsightsLoading(true);
    setCustomerInsightsError(null);
    setCustomerInsightsData(null);
    void (async () => {
      try {
        const data = await getWmsCustomerInsights(DAMAGE_TENANT_ID, {
          email: hasEmail ? headerEmail : null,
          external_id: !hasEmail ? orderExternalIdForInsights : null,
        });
        if (!cancelled) setCustomerInsightsData(data);
      } catch (e) {
        if (cancelled) return;
        let msg = "Nie udało się wczytać statystyk klienta.";
        if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === "object") {
          const detail = (e.response.data as { detail?: unknown }).detail;
          if (typeof detail === "string" && detail.trim()) msg = detail;
        }
        setCustomerInsightsError(msg);
      } finally {
        if (!cancelled) setCustomerInsightsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerInsightsModalOpen, headerEmail, orderExternalIdForInsights]);

  return (

    <div className="flex h-screen w-full flex-col overflow-hidden bg-white">
      {printLabelToast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[200] max-w-md -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-900 shadow-lg"
          role="status"
        >
          {printLabelToast}
        </div>
      ) : null}
      {inlineSaveToast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[201] max-w-md -translate-x-1/2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-900 shadow-lg"
          role="status"
        >
          {inlineSaveToast}
        </div>
      ) : null}
      {shippingPartialConfirmOpen ? (
        <div
          className="fixed inset-0 z-[135] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wms-shipping-partial-title"
          onClick={() => setShippingPartialConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="wms-shipping-partial-title" className="text-base font-bold text-slate-900">
              Potwierdź zwrot kosztów dostawy
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Zwracasz koszt dostawy dla <span className="font-semibold">NIEPEŁNEGO</span> zamówienia. Czy na pewno chcesz to
              zrobić?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={() => setShippingPartialConfirmOpen(false)}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="min-h-[44px] rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
                onClick={() => {
                  setRefundShipping(true);
                  setShippingPartialConfirmOpen(false);
                }}
              >
                Tak, zwróć
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      <div className="mx-auto w-full max-w-[1400px] shrink-0 px-4 pt-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-6 lg:items-start">
          <div className="min-w-0 flex items-start gap-3 lg:col-span-1">
            <Link
              to={WMS_ROUTES.returns}
              state={wmsReturn ? { preselectOrderId: wmsReturn.order_id } : undefined}
              className="mt-1 shrink-0 self-start rounded px-1 text-lg leading-none text-slate-500 outline-none ring-slate-200 hover:text-slate-700 focus-visible:ring-2"
              title="Wróć do listy RMZ"
            >
              ←
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex min-w-0 items-center">
                <button
                  type="button"
                  disabled={headerOrderDisplay === "—" || isFinished}
                  title="Szczegóły/zamówienie"
                  className="min-w-0 shrink cursor-pointer border-0 bg-transparent p-0 text-left text-2xl font-bold leading-tight tracking-tight text-slate-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#41546a]/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline sm:text-3xl"
                  onClick={() => setOrderDetailsModalOpen(true)}
                >
                  {headerOrderDisplay}
                </button>
                {wmsReturn ? (
                  <span className={`ml-2 shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${returnHeaderBadgeClass}`}>
                    {returnHeaderBadgeLabel}
                  </span>
                ) : null}
                {wmsReturn && wmsSettings && !wmsSettings.enable_refund ? (
                  <span
                    className="ml-2 max-w-[14rem] shrink-0 truncate rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                    title="Zwrot środków — rozliczenie w panelu biura"
                  >
                    Zwrot środków — w biurze
                  </span>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 sm:text-sm">
                <span className="text-base font-bold tabular-nums text-blue-600">
                  {displayWarehouseDocumentNumber(wmsReturn?.rmz_number) || wmsReturn?.rmz_number?.trim() || "—"}
                </span>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                {wmsReturn?.ui_status?.name ? (
                  <span
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200/80 px-1.5 py-0.5 text-[11px] font-semibold leading-snug sm:text-xs"
                    style={panelStatusRichPreviewStyle(wmsReturn.ui_status)}
                  >
                    {wmsReturn.ui_status.image_url ? (
                      <img
                        src={wmsReturn.ui_status.image_url}
                        alt=""
                        className="h-3.5 w-3.5 shrink-0 rounded object-contain sm:h-4 sm:w-4"
                      />
                    ) : null}
                    <span className="font-semibold text-slate-600">Panel:</span>
                    <span className="min-w-0 truncate">{wmsReturn.ui_status.name}</span>
                  </span>
                ) : null}
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  disabled={sessionLoading || !wmsReturn}
                  title="Statystyki klienta — zamówienia i zwroty"
                  className="max-w-[min(100%,16rem)] truncate border-0 bg-transparent p-0 text-left text-inherit underline-offset-2 hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#41546a]/40 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50 sm:max-w-xs"
                  onClick={() => setCustomerInsightsModalOpen(true)}
                >
                  {customerHeaderLabel}
                </button>
                {customerInsightsPeekLoading ? (
                  <span className="inline-flex max-w-full shrink-0 items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    Statystyki…
                  </span>
                ) : customerInsightsPeek ? (
                  <button
                    type="button"
                    disabled={sessionLoading || !wmsReturn}
                    title={`${customerInsightsPeek.risk_label} — kliknij po więcej`}
                    className={`inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm transition ${customerReturnPeekBadgeSurfaceClass(customerInsightsPeek.risk_tier)} disabled:cursor-not-allowed disabled:opacity-50`}
                    onClick={() => setCustomerInsightsModalOpen(true)}
                  >
                    <span aria-hidden>⚠</span>
                    <span className="min-w-0 truncate">
                      {(customerInsightsPeek.return_rate * 100).toLocaleString("pl-PL", {
                        maximumFractionDigits: 0,
                      })}
                      % zwrotów
                    </span>
                  </button>
                ) : null}
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <span className="text-slate-500">{orderSourceDisplay || "—"}</span>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                {headerPhone ? (
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-0 py-0.5 text-left hover:border-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isFinished}
                    onClick={() => setSellasistCallModalOpen(true)}
                  >
                    <span aria-hidden className="select-none">
                      📞
                    </span>
                    <span className="font-medium tabular-nums text-slate-800">{headerPhone}</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-2 text-slate-500">
                    <span aria-hidden>📞</span>
                    <span>—</span>
                  </span>
                )}
                <span className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-slate-500">Email:</span>
                  {headerEmail ? (
                    <a
                      className="min-w-0 truncate font-medium text-slate-800 underline-offset-2 hover:underline"
                      href={`mailto:${headerEmail}`}
                    >
                      {headerEmail}
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                <span>
                  Dokument: <span className="font-semibold text-slate-800">{salesDocumentNumber || "—"}</span>
                </span>
                <span className="text-slate-300" aria-hidden>
                  ·
                </span>
                <span>
                  Ilość sztuk: <span className="font-semibold tabular-nums text-slate-800">{totalUnits}</span>
                </span>
              </div>

              <div className="flex max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-700">
                  Status
                  <select
                    className="max-w-full min-w-[12rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100"
                    disabled={isFinished || sessionLoading || panelUiStatusSaving || !(panelUiSummary?.groups?.length)}
                    value={pendingPanelUiSubStatusId === "" ? "" : String(pendingPanelUiSubStatusId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPendingPanelUiSubStatusId(v === "" ? "" : Math.floor(Number(v)));
                    }}
                  >
                    <option value="">— bez etykiety —</option>
                    {(panelUiSummary?.groups ?? []).map((block) => (
                      <optgroup key={block.main_group} label={PANEL_UI_GROUP_LABELS[block.main_group]}>
                        {block.sub_statuses.map((s) => (
                          <option key={s.id} value={String(s.id)}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={isFinished || sessionLoading || panelUiStatusSaving || panelUiStatusSaveDisabled}
                  className="h-fit w-fit rounded-lg bg-[#41546a] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#364556] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void savePanelReturnUiStatus()}
                >
                  {panelUiStatusSaving ? "Zapisywanie…" : "Zapisz status"}
                </button>
              </div>
              {panelUiStatusesError ? <p className="text-xs font-medium text-amber-800">{panelUiStatusesError}</p> : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-center justify-center lg:col-span-1">
            {wmsSettings && !wmsSettings.enable_refund ? (
              <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-xs leading-relaxed text-slate-600 shadow-sm">
                Zwrot środków rozliczany w panelu biura.
              </div>
            ) : (
            <div
              className={`w-full max-w-sm rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 shadow-sm ${isFinished ? "opacity-60" : ""}`}
              title="Zwrot kosztów dostawy do klienta"
            >
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Zwrot kosztów dostawy</p>
              <p className="mb-2 text-center text-[11px] leading-snug text-slate-600">
                Sztuki: <span className="font-bold tabular-nums text-slate-800">{totalUnits}</span>
                {" na zwrocie · "}
                <span className="font-bold tabular-nums text-slate-800">{orderQtySumForFullReturn}</span>
                {" w zamówieniu"}
              </p>
              {isFullReturn ? (
                <p className="mb-3 text-center text-[11px] font-medium leading-snug text-emerald-800">
                  Pełny zwrot — zwrot kosztów dostawy domyślnie włączony.
                </p>
              ) : (
                <p className="mb-3 text-center text-[11px] font-medium leading-snug text-amber-900">
                  Niepełny zwrot — włączenie zwrotu kosztów dostawy wymaga świadomego potwierdzenia.
                </p>
              )}
              <label
                className={`flex flex-wrap items-center justify-center gap-3 text-sm text-slate-800 ${isFinished || orderShippingRefundMeta.displayMissing ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                {orderShippingRefundMeta.displayMissing ? (
                  <span className="text-center text-sm font-medium text-slate-500">Brak kosztu dostawy</span>
                ) : (
                  <span className="inline-flex items-baseline gap-1">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={refundShippingAmount}
                      disabled={isFinished || !refundShipping}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        setRefundShippingAmount(Math.max(0, v));
                      }}
                      className="w-[6rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-base font-bold tabular-nums outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                      aria-label="Kwota zwrotu kosztów dostawy"
                    />
                    <span className="font-semibold text-slate-600">zł</span>
                  </span>
                )}
                <input
                  type="checkbox"
                  checked={refundShipping}
                  disabled={isFinished || orderShippingRefundMeta.displayMissing}
                  onChange={(e) => {
                    if (isFinished || orderShippingRefundMeta.displayMissing) return;
                    const want = e.target.checked;
                    if (!want) {
                      setRefundShipping(false);
                      return;
                    }
                    if (isFullReturn) {
                      setRefundShipping(true);
                      return;
                    }
                    setShippingPartialConfirmOpen(true);
                  }}
                  className="h-5 w-5 shrink-0 rounded border-slate-300 disabled:cursor-not-allowed"
                  aria-label="Włącz zwrot kosztów dostawy"
                />
              </label>
            </div>
            )}
          </div>

          <div className="flex w-full flex-col items-end gap-2 lg:col-span-1">
            <button
              type="button"
              disabled={isFinished}
              title="Korespondencja (Allegro, e-mail, notatki)"
              className="h-10 w-full max-w-[15rem] rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 lg:max-w-none lg:self-end lg:px-6"
              onClick={() => setCorrespondenceModalOpen(true)}
            >
              💬 KORESPONDENCJA
            </button>
            <button
              type="button"
              disabled={sessionLoading || gridLoading || !allLinesFullyResolved || saveChangesLoading || isFinished}
              className="min-h-14 w-full max-w-[15rem] rounded-lg bg-[#56b36a] px-5 text-base font-bold text-white shadow-sm hover:bg-[#4a9e5b] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:min-h-[3.5rem] sm:text-lg lg:max-w-none lg:self-end lg:min-w-[14rem]"
              onClick={() => void handleSaveDirtyLines()}
              title={
                allLinesFullyResolved
                  ? damagedUnitsMissingPhotos > 0
                    ? "Brak zdjęcia uszkodzenia — zapis z potwierdzeniem"
                    : "Zapisz wszystkie decyzje i wyślij do biura"
                  : "Uzupełnij decyzje dla wszystkich pozycji"
              }
            >
              {saveChangesLoading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden
                  />
                  Zapisywanie…
                </span>
              ) : (
                "ZAPISZ"
              )}
            </button>
            <button
              type="button"
              disabled={isFinished || displayLines.length < 1}
              onClick={acceptAllLocal}
              className="h-10 w-full max-w-[15rem] rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 lg:max-w-none lg:self-end lg:px-6"
              title="Ustaw OK dla pozycji bez decyzji (lokalnie, do zapisu)."
            >
              Przyjmij wszystko (Szybka akcja)
            </button>
          </div>
        </div>
        </div>
      </div>

      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-1 flex-col overflow-hidden px-4 pb-4">
        <div className="flex h-full min-h-0 flex-1 flex-col">
        {sessionLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center text-sm text-slate-600 shadow-sm">
            Ładowanie zwrotu…
          </div>
        ) : sessionLoadError ? (
          <div className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-8 py-10 text-center shadow-sm">
            <p className="text-base font-semibold text-rose-900">{sessionLoadError}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="min-h-[44px] rounded-xl bg-rose-700 px-5 text-sm font-bold text-white shadow-sm hover:bg-rose-800"
                onClick={() => setSessionRetryKey((k) => k + 1)}
              >
                Spróbuj ponownie
              </button>
              <Link
                to={WMS_ROUTES.returns}
                className="min-h-[44px] inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Wróć do listy RMZ
              </Link>
            </div>
          </div>
        ) : !wmsReturn ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center text-sm text-slate-600 shadow-sm">
            Brak danych zwrotu.
          </div>
        ) : gridLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center text-sm text-slate-600 shadow-sm">
            Ładowanie pozycji…
          </div>
        ) : wmsReturn.lines.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center text-sm text-slate-700 shadow-sm">
            Ten zwrot nie zawiera pozycji do obsługi.
          </div>
        ) : lineSeeds.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center text-sm text-slate-700 shadow-sm">
            Nie udało się wczytać pozycji zamówienia. Wróć do zamówienia i spróbuj ponownie.
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-1 gap-4">
            <RmzProcessLineSidebar
              items={visibleSidebarItems}
              selectedLineId={activeLineId}
              resolvedCount={returnsProgress.resolvedUnits}
              totalCount={returnsProgress.totalUnits}
              hideResolved={hideResolvedProducts}
              onToggleHideResolved={setHideResolvedProducts}
              onSelect={setActiveLineId}
              disabled={isFinished}
            />
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              {leftViewMode === "grid" ? (
                (() => {
                  const workspaceLineId = activeLineId;
                  const lines = workspaceLineId
                    ? displayLines.filter((ln) => ln.lineId === workspaceLineId)
                    : [];
                  if (lines.length === 0) {
                    return (
                      <div className="flex flex-1 flex-col items-center justify-center p-10 text-slate-500">
                        <p className="text-sm font-medium">Wybierz produkt z listy, aby rozpocząć ocenę stanu.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="grid w-full auto-rows-fr grid-cols-1 gap-5 p-4">
                      {lines.map((ln) => {
                        const c = ln.candidate;
                        const qty = Math.floor(c.availableQuantity);
                        const meta = lineSeedByLineId.get(ln.lineId);
                        const returnLineIdForPrint = meta?.rmzLineId ?? null;
                        const ean = meta?.ean || "—";
                        const sku = meta?.sku || c.sku || "—";
                        const imgSrc = c.imageUrl ? resolveDamageMediaUrl(c.imageUrl) : "";
                        const rows = unitRowsByLineId[ln.lineId] ?? [];
                        const checkedCount = rows.filter((r) => r.decision != null).length;
                        const isProcessed = checkedCount >= qty && qty > 0;
                        const rowSlice = rows.slice(0, Math.max(0, qty));
                        const acceptedN = rowSlice.filter((r) => r.decision === "ACCEPTED").length;
                        const damagedN = rowSlice.filter((r) => r.decision === "DAMAGED").length;
                        const damagedBn = rowSlice.filter((r) => r.decision === "DAMAGED" && r.damageClass === "B").length;
                        const damagedCn = rowSlice.filter((r) => r.decision === "DAMAGED" && r.damageClass === "C").length;
                        const rejectedN = rowSlice.filter((r) => r.decision === "REJECTED").length;
                        const pendingN = Math.max(0, qty - checkedCount);
                        const savedDamageEntries = Array.isArray(meta?.damageEntries) ? meta.damageEntries : [];
                        const homogeneousDecision =
                          qty > 0 &&
                          rowSlice.length === qty &&
                          rowSlice.every((r) => r.decision != null) &&
                          rowSlice.every((r) => r.decision === rowSlice[0]?.decision)
                            ? rowSlice[0]!.decision
                            : null;
                        const mixedSplitDone = isProcessed && homogeneousDecision == null;
                        const resolvedDecision = isProcessed ? homogeneousDecision : null;
                        const overlayIcon = mixedSplitDone
                          ? "⧉"
                          : resolvedDecision === "ACCEPTED"
                            ? "✓"
                            : resolvedDecision === "DAMAGED"
                              ? "⚠"
                              : resolvedDecision === "REJECTED"
                                ? "✕"
                                : "";
                        const overlayTint = mixedSplitDone
                          ? "bg-slate-800/40"
                          : resolvedDecision === "ACCEPTED"
                            ? "bg-emerald-700/35"
                            : resolvedDecision === "DAMAGED"
                              ? "bg-amber-700/35"
                              : resolvedDecision === "REJECTED"
                                ? "bg-rose-700/35"
                                : "";
                        const cardMode = gridLineModeByLineId[ln.lineId] ?? "idle";
                        const inQtyPick =
                          cardMode === "pick_accept" ||
                          cardMode === "pick_reject_qty" ||
                          cardMode === "pick_damage_qty";
                        const pendingPickSlots = rowSlice.filter((r) => r.decision === null).length;
                        const cardUnlockedForEdit = !!gridUnlockEditByLineId[ln.lineId];
                        const lineDirty = !!dirtyLineIds[ln.lineId];
                        const lineSplitSaving = !!savingSplitByLineId[ln.lineId];
                        /** Zablokuj 3 przyciski tylko po zapisie (brak dirty); przed zapisem użytkownik może zmienić decyzję. */
                        const cardLocked =
                          isFinished || (isProcessed && !lineDirty && !cardUnlockedForEdit);
                        const showSavedDoneOverlay =
                          isProcessed && !cardUnlockedForEdit && !lineDirty;
                        const inDamageOrRejectFlow =
                          inQtyPick ||
                          (cardMode === "damaged" && !!gridDamagedOpenByLineId[ln.lineId]) ||
                          cardMode === "reject";
                        const showRejectEditor = cardMode === "reject";
                        const damageDraft = gridDamageDraftByLineId[ln.lineId] ?? EMPTY_GRID_DAMAGE_DRAFT;
                        const damageUiClass = damageDraft.damageClass;
                        const photoUrls = damageDraft.photoUrls;
                        const showDamagedEditor = cardMode === "damaged" && !!gridDamagedOpenByLineId[ln.lineId];
                        let gridActiveDecision: "ACCEPTED" | "DAMAGED" | "REJECTED" | null = null;
                        if (showRejectEditor) gridActiveDecision = "REJECTED";
                        else if (showDamagedEditor) gridActiveDecision = "DAMAGED";
                        else if (homogeneousDecision) gridActiveDecision = homogeneousDecision;
                        const showEditSavedBtn =
                          isProcessed && !lineDirty && !cardUnlockedForEdit && !isFinished;
                        const showChangeDecisionBtn =
                          !isFinished &&
                          !showEditSavedBtn &&
                          (inDamageOrRejectFlow || (isProcessed && (lineDirty || cardUnlockedForEdit)));
                        const firstDamaged = rows.find((r) => r.decision === "DAMAGED");
                        const summaryPhotos =
                          resolvedDecision === "DAMAGED" ? (firstDamaged?.photoUrls.length ?? 0) : 0;
                        const summaryUiClass =
                          resolvedDecision === "DAMAGED" && firstDamaged ? firstDamaged.damageClass : "";
                        const summaryText = mixedSplitDone
                          ? `Zapisano: ${acceptedN}× OK · ${damagedN}× uszkodzone · ${rejectedN}× odrzucone`
                          : resolvedDecision === "DAMAGED"
                            ? `Zapisano: Klasa ${summaryUiClass} • ${summaryPhotos} ${summaryPhotos === 1 ? "zdjęcie" : summaryPhotos >= 2 && summaryPhotos <= 4 ? "zdjęcia" : "zdjęć"}`
                            : resolvedDecision === "ACCEPTED"
                              ? "Przyjęty OK"
                              : resolvedDecision === "REJECTED"
                                ? "Odrzucony"
                                : "";

                        const preSaveComplete = lineDirty && isProcessed;
                        const preSaveAccentDecision =
                          preSaveComplete && homogeneousDecision ? homogeneousDecision : null;
                        const preSaveBadgeDamagedClass =
                          preSaveAccentDecision === "DAMAGED"
                            ? firstDamaged?.damageClass ?? "B"
                            : showDamagedEditor && damageUiClass
                              ? damageUiClass
                              : null;
                        const preSaveCardAccent =
                          preSaveAccentDecision === "ACCEPTED"
                            ? "border-2 border-green-400 bg-green-100"
                            : preSaveAccentDecision === "DAMAGED"
                              ? "border-2 border-orange-500 bg-orange-200"
                              : preSaveAccentDecision === "REJECTED"
                                ? "border-2 border-red-400 bg-red-100"
                                : showDamagedEditor && damageUiClass
                                  ? "border-2 border-orange-500 bg-orange-200"
                                  : showRejectEditor
                                    ? "border-2 border-red-400 bg-red-100"
                                    : "";
                        const preSaveBadgeText =
                          preSaveAccentDecision === "ACCEPTED"
                            ? "PRZYJĘTY (A)"
                            : preSaveAccentDecision === "DAMAGED" && preSaveBadgeDamagedClass
                              ? `USZKODZONY (${preSaveBadgeDamagedClass})`
                              : preSaveAccentDecision === "REJECTED"
                                ? "ODRZUCONY"
                                : showDamagedEditor && damageUiClass
                                  ? `USZKODZONY (${damageUiClass})`
                                  : showRejectEditor
                                    ? "ODRZUCONY"
                                    : null;
                        const showPreSaveBadge =
                          preSaveBadgeText != null && (lineDirty || showDamagedEditor || showRejectEditor);
                        const preSaveBadgeClass =
                          preSaveAccentDecision === "ACCEPTED"
                            ? "border border-green-400 bg-green-100 text-green-900 font-bold shadow-sm"
                            : preSaveAccentDecision === "DAMAGED"
                              ? "border-2 border-orange-500 bg-orange-200 text-orange-900 font-bold shadow-sm"
                              : preSaveAccentDecision === "REJECTED"
                                ? "border border-red-400 bg-red-100 text-red-900 font-bold shadow-sm"
                                : showDamagedEditor && damageUiClass
                                  ? "border-2 border-orange-500 bg-orange-200 text-orange-900 font-bold shadow-sm"
                                  : showRejectEditor
                                    ? "border border-red-400 bg-red-100 text-red-900 font-bold shadow-sm"
                                    : "bg-slate-800 text-white shadow-sm";
                        const savedAcceptOutcomeBadgeText =
                          homogeneousDecision === "ACCEPTED" &&
                          isProcessed &&
                          !lineDirty &&
                          !showDamagedEditor &&
                          !showRejectEditor
                            ? "PRZYJĘTY (A)"
                            : null;
                        const savedRejectOutcomeBadgeText =
                          homogeneousDecision === "REJECTED" &&
                          isProcessed &&
                          !lineDirty &&
                          !showDamagedEditor &&
                          !showRejectEditor
                            ? "ODRZUCONY"
                            : null;
                        const savedOutcomeBadgeText =
                          savedAcceptOutcomeBadgeText ?? savedRejectOutcomeBadgeText;
                        const topRightDecisionBadgeText =
                          showPreSaveBadge && preSaveBadgeText ? preSaveBadgeText : savedOutcomeBadgeText;
                        const topRightDecisionBadgeClass =
                          showPreSaveBadge && preSaveBadgeText
                            ? preSaveBadgeClass
                            : savedAcceptOutcomeBadgeText
                              ? "border border-emerald-600 bg-emerald-100 text-emerald-900 font-bold shadow-sm"
                              : savedRejectOutcomeBadgeText
                                ? "border border-rose-600 bg-rose-100 text-rose-900 font-bold shadow-sm"
                                : "";
                        const cardBorderClass = preSaveCardAccent
                          ? preSaveCardAccent
                          : isProcessed && !lineDirty && homogeneousDecision === "ACCEPTED"
                            ? "border-2 border-emerald-500 bg-emerald-50 shadow-sm"
                            : isProcessed && !lineDirty && homogeneousDecision === "DAMAGED"
                              ? "border-2 border-amber-500 bg-amber-50 shadow-sm"
                              : isProcessed && !lineDirty && homogeneousDecision === "REJECTED"
                                ? "border-2 border-rose-500 bg-rose-50 shadow-sm"
                                : isProcessed && !lineDirty && mixedSplitDone
                                  ? "border border-slate-300 bg-slate-50 shadow-sm"
                                  : isProcessed && !lineDirty
                                    ? "border border-emerald-300 bg-white"
                                    : "border border-slate-200 bg-white";

                        return (
                          <div
                            id={`rmz-grid-card-${ln.lineId}`}
                            key={ln.lineId}
                            className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl transition ${highlightCardLineId === ln.lineId ? "ring-4 ring-blue-300" : ""} ${cardBorderClass}`}
                          >
                            {showChangeDecisionBtn ? (
                              <button
                                type="button"
                                className="absolute left-2 top-2 z-20 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                                onClick={() => resetGridLineDecision(ln.lineId)}
                              >
                                ← ZMIEŃ DECYZJĘ
                              </button>
                            ) : null}
                            {showEditSavedBtn ? (
                              <button
                                type="button"
                                className="absolute left-2 top-2 z-20 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                                onClick={() => startEditSavedGridLine(ln.lineId)}
                              >
                                EDYTUJ
                              </button>
                            ) : null}
                            {returnLineIdForPrint != null && returnLineIdForPrint > 0 ? (
                              <div className="absolute right-2 top-2 z-[65]">
                                <button
                                  type="button"
                                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-lg font-bold leading-none text-slate-600 shadow-sm hover:bg-slate-50"
                                  aria-expanded={gridCardMenuLineId === ln.lineId}
                                  aria-haspopup="menu"
                                  aria-label="Menu karty"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setGridCardMenuLineId((x) => (x === ln.lineId ? null : ln.lineId));
                                  }}
                                >
                                  ⋮
                                </button>
                                {gridCardMenuLineId === ln.lineId ? (
                                  <div
                                    role="menu"
                                    className="absolute right-0 top-full mt-1 min-w-[9rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                                    onClick={(ev) => ev.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                                      onClick={() => {
                                        setGridCardMenuLineId(null);
                                        void runPrintReturnLine(ln.lineId);
                                      }}
                                    >
                                      Drukuj
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {topRightDecisionBadgeText ? (
                              <span
                                className={`absolute right-2 z-30 max-w-[calc(100%-4rem)] truncate rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${returnLineIdForPrint != null && returnLineIdForPrint > 0 ? "top-11" : "top-2"} ${topRightDecisionBadgeClass}`}
                                title={topRightDecisionBadgeText}
                              >
                                {topRightDecisionBadgeText}
                              </span>
                            ) : null}
                            <div className="relative flex h-[180px] w-full shrink-0 items-center justify-center bg-white rounded-t-lg">
                              {imgSrc ? (
                                <img src={imgSrc} alt="" className="max-h-full max-w-full object-contain bg-white p-2" />
                              ) : (
                                <div className="text-center text-sm font-medium text-slate-400">Brak zdjęcia</div>
                              )}
                              {qty > 1 ? (
                                <span className="absolute left-2 top-2 z-10 rounded-full bg-slate-900/85 px-2.5 py-1 text-xs font-bold text-white">
                                  x{qty}
                                </span>
                              ) : null}
                            </div>
                            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                              <div className="flex shrink-0 flex-col gap-1.5 px-4 pb-2 pt-4">
                                <h3 className="line-clamp-2 min-h-[36px] text-base font-bold text-slate-900">{c.productName}</h3>
                                <p className="text-xs font-medium tracking-wide text-slate-500">
                                  EAN: <span className="tabular-nums text-slate-600">{ean}</span>
                                  <span className="mx-1.5 text-slate-300" aria-hidden>
                                    •
                                  </span>
                                  SKU: <span className="font-semibold text-slate-600">{sku}</span>
                                </p>
                                <div className="flex flex-col gap-1 pt-0.5">
                                  <div className="flex flex-wrap gap-1.5">
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-900">
                                      OK: {acceptedN}
                                    </span>
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-amber-950">
                                      B: {damagedBn}
                                    </span>
                                    <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-amber-950">
                                      C: {damagedCn}
                                    </span>
                                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-rose-900">
                                      ODRZ: {rejectedN}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-800">
                                      POZ: {pendingN}
                                    </span>
                                  </div>
                                  {savedDamageEntries.length > 0 ? (
                                    <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-dashed border-amber-200/80 bg-white/80 px-2 py-2">
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                        Uszkodzone sztuki
                                      </p>
                                      {savedDamageEntries.map((ent, ei) => {
                                        const reason = damageEntryReasonSummary(ent.damage_type, dmgReasons);
                                        const pc = ent.photo_urls?.length ?? 0;
                                        const noteLine = ent.note?.trim();
                                        const operator = ent.operator_name?.trim() || "operator";
                                        const when = ent.created_at ? formatOrderDetailDate(ent.created_at) : "—";
                                        return (
                                          <div
                                            key={`${ent.id}-${ei}`}
                                            className="rounded-md border border-amber-200 bg-amber-50/80 px-2 py-2 text-[11px] text-amber-950"
                                          >
                                            <div className="font-bold uppercase tracking-wide text-slate-900">
                                              Uszkodzony {ent.condition} · #{ei + 1}
                                            </div>
                                            <div className="mt-0.5 tabular-nums">{reason || "Brak wskazanej przyczyny"}</div>
                                            {noteLine ? <div className="mt-0.5 text-slate-700">{noteLine}</div> : null}
                                            <div className="mt-1 text-slate-600">
                                              {pc} {pc === 1 ? "zdjęcie" : "zdjęć"} · {when} · {operator}
                                            </div>
                                            {pc > 0 ? (
                                              <div className="mt-1.5 flex flex-wrap gap-1">
                                                {(ent.photo_urls ?? []).slice(0, 6).map((u, pi) => (
                                                  <img
                                                    key={`${u}-${pi}`}
                                                    src={resolveDamageMediaUrl(u)}
                                                    alt=""
                                                    className="h-10 w-10 rounded border border-amber-200 object-cover"
                                                  />
                                                ))}
                                              </div>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                  <p className="text-[11px] font-semibold tabular-nums text-slate-600">
                                    Rozliczono {checkedCount} / {qty} szt.
                                  </p>
                                </div>
                              </div>

                              <div
                                className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${
                                  showDamagedEditor ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                                }`}
                              >
                                <div className="min-h-0 overflow-hidden">
                                  {showDamagedEditor ? (
                                    <div className="max-h-[min(70vh,36rem)] space-y-5 overflow-y-auto border-t-2 border-orange-500 bg-white px-3 pb-3 pt-3 shadow-inner">
                                      <p className="text-center text-xs font-bold uppercase tracking-wide text-orange-950">
                                        Jedna uszkodzona sztuka — uzupełnij i zapisz. Powtórz „USZKODZONY” dla kolejnych.
                                      </p>

                                      <div className="space-y-2">
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Klasa uszkodzenia</p>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            disabled={isFinished}
                                            title={RMZ_DAMAGE_CLASS_B_TOOLTIP}
                                            className={`min-h-[52px] min-w-0 flex-1 rounded-xl px-2 text-sm font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-base ${damageUiClass === "B" ? "bg-amber-600 text-white ring-2 ring-amber-800/40" : "border-2 border-amber-200 bg-white text-amber-950 hover:bg-amber-100"}`}
                                            onClick={() => {
                                              setGridDamageDraftByLineId((prev) => {
                                                const d = prev[ln.lineId] ?? EMPTY_GRID_DAMAGE_DRAFT;
                                                return {
                                                  ...prev,
                                                  [ln.lineId]: {
                                                    ...d,
                                                    damageClass: "B",
                                                    damageTypeIds: filterRmzDamageTypeIdsForClass("B", d.damageTypeIds),
                                                  },
                                                };
                                              });
                                            }}
                                          >
                                            KLASA B
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isFinished}
                                            title={RMZ_DAMAGE_CLASS_C_TOOLTIP}
                                            className={`min-h-[52px] min-w-0 flex-1 rounded-xl px-2 text-sm font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-base ${damageUiClass === "C" ? "bg-amber-700 text-white ring-2 ring-amber-900/40" : "border-2 border-amber-200 bg-white text-amber-950 hover:bg-amber-100"}`}
                                            onClick={() => {
                                              setGridDamageDraftByLineId((prev) => {
                                                const d = prev[ln.lineId] ?? EMPTY_GRID_DAMAGE_DRAFT;
                                                return {
                                                  ...prev,
                                                  [ln.lineId]: {
                                                    ...d,
                                                    damageClass: "C",
                                                    damageTypeIds: filterRmzDamageTypeIdsForClass("C", d.damageTypeIds),
                                                  },
                                                };
                                              });
                                            }}
                                          >
                                            KLASA C
                                          </button>
                                        </div>
                                      </div>

                                      {damageUiClass === "B" || damageUiClass === "C" ? (
                                        <RmzDamageTypeChips
                                          damageClass={damageUiClass}
                                          selectedIds={filterRmzDamageTypeIdsForClass(damageUiClass, damageDraft.damageTypeIds)}
                                          disabled={isFinished}
                                          onToggle={(id) => {
                                            setGridDamageDraftByLineId((prev) => {
                                              const d = prev[ln.lineId] ?? EMPTY_GRID_DAMAGE_DRAFT;
                                              const dc = damageUiClass;
                                              const cur = filterRmzDamageTypeIdsForClass(dc, d.damageTypeIds);
                                              const has = cur.includes(id);
                                              const next = has ? cur.filter((x) => x !== id) : [...cur, id];
                                              return {
                                                ...prev,
                                                [ln.lineId]: {
                                                  ...d,
                                                  damageTypeIds: filterRmzDamageTypeIdsForClass(dc, next),
                                                },
                                              };
                                            });
                                          }}
                                        />
                                      ) : null}

                                      <label className="block space-y-1">
                                        <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                                          Notatka (opcjonalnie)
                                        </span>
                                        <textarea
                                          rows={2}
                                          disabled={isFinished}
                                          value={damageDraft.note}
                                          onChange={(e) =>
                                            setGridDamageDraftByLineId((prev) => {
                                              const d = prev[ln.lineId] ?? EMPTY_GRID_DAMAGE_DRAFT;
                                              return {
                                                ...prev,
                                                [ln.lineId]: { ...d, note: e.target.value },
                                              };
                                            })
                                          }
                                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                                          placeholder="Np. stan opakowania, uwagi do outletu…"
                                        />
                                      </label>

                                      <div className="space-y-3">
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Zdjęcie uszkodzenia</p>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            disabled={
                                              isFinished ||
                                              uploadingLinePhotoById[`${ln.lineId}:0`] ||
                                              isUploadingPhotos ||
                                              photoUrls.length >= MAX_DAMAGE_PHOTOS
                                            }
                                            className="flex min-h-[56px] min-w-0 flex-[2] items-center justify-center rounded-xl bg-slate-900 px-2 py-3 text-center text-xs font-bold leading-tight text-white shadow-md hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm"
                                            onClick={() => void startCamera(photoUrls.length, ln.lineId, 0)}
                                          >
                                            📷 ZRÓB ZDJĘCIE
                                          </button>
                                          <button
                                            type="button"
                                            disabled={
                                              isFinished || uploadingLinePhotoById[`${ln.lineId}:0`] || photoUrls.length >= MAX_DAMAGE_PHOTOS
                                            }
                                            className="flex min-h-[56px] min-w-0 flex-1 items-center justify-center rounded-xl bg-indigo-700 px-2 py-3 text-center text-xs font-bold leading-tight text-white shadow-md hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                                            onClick={() => void openPhoneUploadSessionForUnit(ln.lineId, 0)}
                                          >
                                            📱 TELEFON
                                          </button>
                                          <label
                                            className={`flex min-h-[56px] min-w-0 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#41546a] px-2 py-3 text-center text-xs font-bold leading-tight text-white shadow-md hover:bg-[#36444d] sm:text-sm ${isFinished || uploadingLinePhotoById[`${ln.lineId}:0`] || photoUrls.length >= MAX_DAMAGE_PHOTOS ? "pointer-events-none opacity-50" : ""}`}
                                          >
                                            📁 Z DYSKU
                                            <input
                                              type="file"
                                              accept="image/*"
                                              multiple
                                              className="sr-only"
                                              disabled={
                                                isFinished || uploadingLinePhotoById[`${ln.lineId}:0`] || photoUrls.length >= MAX_DAMAGE_PHOTOS
                                              }
                                              onChange={(e) => {
                                                void uploadUnitPhotos(ln.lineId, 0, e.target.files);
                                                e.target.value = "";
                                              }}
                                            />
                                          </label>
                                        </div>
                                        {cameraActive && gridCameraLineId === ln.lineId && gridCameraUnitIndex === 0 ? (
                                          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-inner">
                                            <video
                                              ref={videoRef}
                                              autoPlay
                                              playsInline
                                              muted
                                              className="h-48 w-full rounded-lg bg-black object-contain"
                                            />
                                            <div className="block space-y-2">
                                              <button
                                                type="button"
                                                disabled={isFinished}
                                                className="block min-h-[44px] w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                onClick={() => captureFromCamera(ln.lineId, 0)}
                                              >
                                                Zrób zdjęcie
                                              </button>
                                              <button
                                                type="button"
                                                className="block min-h-[44px] w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
                                                onClick={() => stopCamera()}
                                              >
                                                Zamknij kamerę
                                              </button>
                                            </div>
                                          </div>
                                        ) : null}
                                        {photoUrls.length > 0 ? (
                                          <div className="block">
                                            {photoUrls.map((u, i) => (
                                              <div key={`${u}-${i}`} className="relative mb-3 mr-3 inline-block align-top">
                                                <img
                                                  src={resolveDamageMediaUrl(u)}
                                                  alt=""
                                                  className="h-20 w-20 rounded-lg border border-slate-200 object-cover shadow-sm"
                                                />
                                                <button
                                                  type="button"
                                                  disabled={isFinished}
                                                  className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white shadow hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                  title="Usuń zdjęcie"
                                                  onClick={() =>
                                                    setGridDamageDraftByLineId((prev) => {
                                                      const d = prev[ln.lineId] ?? EMPTY_GRID_DAMAGE_DRAFT;
                                                      const nextUrls = d.photoUrls.filter((_, j) => j !== i);
                                                      return { ...prev, [ln.lineId]: { ...d, photoUrls: nextUrls } };
                                                    })
                                                  }
                                                >
                                                  ×
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="text-sm font-semibold text-amber-700">Brak zdjęcia uszkodzenia (wymagane przy ZAPISZ)</p>
                                        )}
                                      </div>

                                      {damageSaveError ? (
                                        <p className="text-center text-sm font-semibold text-rose-700">{damageSaveError}</p>
                                      ) : null}

                                      <button
                                        type="button"
                                        disabled={isFinished}
                                        className="min-h-[48px] w-full rounded-xl border-2 border-slate-300 bg-white py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        onClick={() => {
                                          setDamageSaveError(null);
                                          stopCamera();
                                          setGridLineModeByLineId((prev) => ({ ...prev, [ln.lineId]: "idle" }));
                                          setGridDamagedOpenByLineId((prev) => ({ ...prev, [ln.lineId]: false }));
                                          setGridDamageDraftByLineId((prev) => {
                                            const n = { ...prev };
                                            delete n[ln.lineId];
                                            return n;
                                          });
                                        }}
                                      >
                                        Anuluj
                                      </button>

                                      <button
                                        type="button"
                                        disabled={
                                          isFinished ||
                                          damageUiClass == null ||
                                          !!uploadingLinePhotoById[`${ln.lineId}:0`] ||
                                          (damageUiClass != null &&
                                            filterRmzDamageTypeIdsForClass(damageUiClass, damageDraft.damageTypeIds).length < 1)
                                        }
                                        className="min-h-[52px] w-full rounded-xl bg-emerald-700 text-lg font-extrabold uppercase tracking-wide text-white shadow-md hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        onClick={() => saveDamagedProductCard(ln.lineId)}
                                      >
                                        ZAPISZ TĘ SZTUKE
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            {showRejectEditor ? (
                              <div className="absolute inset-0 z-20 block space-y-4 overflow-auto rounded-b-xl border-t border-rose-200/80 bg-white p-3 shadow-lg">
                                <p className="text-center text-xs font-bold uppercase tracking-wide text-rose-900">Odrzucenie — wybierz powód</p>
                                <label className="block text-xs font-semibold text-slate-700">
                                  Dlaczego odrzucasz zwrot? (wymagane)
                                  <select
                                    className="mt-1 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
                                    disabled={isFinished}
                                    value={gridRejectDraftByLineId[ln.lineId] ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setGridRejectDraftByLineId((prev) => ({ ...prev, [ln.lineId]: v }));
                                      if (v !== WMS_REJECT_OTHER_ID) {
                                        setGridRejectOtherDraftByLineId((prev) => {
                                          const n = { ...prev };
                                          delete n[ln.lineId];
                                          return n;
                                        });
                                      }
                                    }}
                                  >
                                    <option value="">— wybierz —</option>
                                    {wmsRejectReasonSelectOptions(productRejectSelectPairs)}
                                  </select>
                                </label>
                                {gridRejectDraftByLineId[ln.lineId] === WMS_REJECT_OTHER_ID ? (
                                  <label className="block text-xs font-semibold text-slate-700">
                                    Uzasadnienie (wymagane)
                                    <textarea
                                      className="mt-1 min-h-[88px] w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
                                      disabled={isFinished}
                                      rows={3}
                                      value={gridRejectOtherDraftByLineId[ln.lineId] ?? ""}
                                      onChange={(e) =>
                                        setGridRejectOtherDraftByLineId((prev) => ({
                                          ...prev,
                                          [ln.lineId]: e.target.value,
                                        }))
                                      }
                                    />
                                  </label>
                                ) : null}
                                {damageSaveError ? <p className="text-center text-sm font-semibold text-rose-700">{damageSaveError}</p> : null}
                                <div className="block space-y-2">
                                  <button
                                    type="button"
                                    disabled={isFinished}
                                    className="block min-h-[48px] w-full rounded-xl border-2 border-slate-300 bg-white py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => {
                                      setDamageSaveError(null);
                                      setPendingRejectBatchByLineId((prev) => {
                                        const n = { ...prev };
                                        delete n[ln.lineId];
                                        return n;
                                      });
                                      setGridLineModeByLineId((prev) => ({ ...prev, [ln.lineId]: "idle" }));
                                    }}
                                  >
                                    Anuluj
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      isFinished ||
                                      cardLocked ||
                                      lineSplitSaving ||
                                      !(gridRejectDraftByLineId[ln.lineId] ?? "").trim() ||
                                      (gridRejectDraftByLineId[ln.lineId] === WMS_REJECT_OTHER_ID &&
                                        !(gridRejectOtherDraftByLineId[ln.lineId] ?? "").trim())
                                    }
                                    className="block min-h-[48px] w-full rounded-xl bg-rose-600 py-3 text-sm font-extrabold uppercase tracking-wide text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => {
                                      confirmGridRejectEditor(
                                        ln.lineId,
                                        gridRejectDraftByLineId[ln.lineId] ?? "",
                                        gridRejectOtherDraftByLineId[ln.lineId] ?? "",
                                      );
                                    }}
                                  >
                                    {lineSplitSaving ? "Zapisywanie…" : "Potwierdź odrzucenie"}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            <div
                              className={`mt-auto flex shrink-0 flex-col gap-3 p-4 pt-0 ${showDamagedEditor || showRejectEditor ? "invisible pointer-events-none select-none" : ""}`}
                              aria-hidden={showDamagedEditor || showRejectEditor ? true : undefined}
                            >
                                {inQtyPick ? (
                                  <>
                                    <p className="text-center text-xs font-bold uppercase tracking-wide text-slate-700">
                                      {cardMode === "pick_accept"
                                        ? "Ilość do przyjęcia"
                                        : cardMode === "pick_damage_qty"
                                          ? "Ilość uszkodzonych (ten zapis)"
                                          : "Ilość do odrzucenia"}
                                    </p>
                                    <div className="flex items-center justify-center gap-3">
                                      <button
                                        type="button"
                                        disabled={
                                          isFinished ||
                                          lineSplitSaving ||
                                          pendingPickSlots < 1 ||
                                          (gridQtyPickDraftByLineId[ln.lineId] ?? 1) <= 1
                                        }
                                        className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-2xl font-bold leading-none text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                        onClick={() => bumpGridQtyPickDraft(ln.lineId, -1, pendingPickSlots)}
                                        aria-label="Zmniejsz liczbę sztuk"
                                      >
                                        −
                                      </button>
                                      <span className="min-w-[2.5rem] text-center text-3xl font-black tabular-nums text-slate-900">
                                        {Math.min(
                                          Math.max(1, gridQtyPickDraftByLineId[ln.lineId] ?? 1),
                                          Math.max(1, pendingPickSlots),
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={
                                          isFinished ||
                                          lineSplitSaving ||
                                          pendingPickSlots < 1 ||
                                          (gridQtyPickDraftByLineId[ln.lineId] ?? 1) >= pendingPickSlots
                                        }
                                        className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-2xl font-bold leading-none text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                                        onClick={() => bumpGridQtyPickDraft(ln.lineId, 1, pendingPickSlots)}
                                        aria-label="Zwiększ liczbę sztuk"
                                      >
                                        +
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={isFinished || lineSplitSaving}
                                      className="min-h-[44px] w-full rounded-xl border-2 border-slate-300 bg-white py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      onClick={() => cancelGridQtyPick(ln.lineId)}
                                    >
                                      Anuluj
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isFinished || lineSplitSaving || pendingPickSlots < 1}
                                      className="min-h-[52px] w-full rounded-xl bg-[#41546a] py-3 text-base font-extrabold uppercase tracking-wide text-white shadow-md hover:bg-[#364556] disabled:cursor-not-allowed disabled:opacity-50"
                                      onClick={() => {
                                        if (cardMode === "pick_accept") {
                                          void confirmPickAcceptSave(
                                            ln.lineId,
                                            gridQtyPickDraftByLineId[ln.lineId] ?? 1,
                                          );
                                          return;
                                        }
                                        if (cardMode === "pick_damage_qty") {
                                          confirmPickDamageQtyContinue(ln.lineId);
                                          return;
                                        }
                                        confirmPickRejectQtyContinue(ln.lineId);
                                      }}
                                    >
                                      {lineSplitSaving
                                        ? "Zapisywanie…"
                                        : cardMode === "pick_accept"
                                          ? "Zapisz przyjęcie"
                                          : cardMode === "pick_damage_qty"
                                            ? "Dalej — dokumentacja"
                                            : "Dalej — powód"}
                                    </button>
                                  </>
                                ) : gridActiveDecision == null ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={cardLocked || lineSplitSaving}
                                      className="h-14 w-full text-lg rounded-xl bg-emerald-600 font-extrabold tracking-wide text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => handleGridDecision(ln.lineId, "accepted")}
                                    >
                                      {lineSplitSaving ? "Zapisywanie…" : "PRZYJĘTY"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={cardLocked || lineSplitSaving}
                                      className="h-14 w-full text-lg rounded-xl bg-amber-600 font-extrabold tracking-wide text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => handleGridDecision(ln.lineId, "damaged")}
                                    >
                                      USZKODZONY
                                    </button>
                                    <button
                                      type="button"
                                      disabled={cardLocked || lineSplitSaving}
                                      className="h-14 w-full text-lg rounded-xl bg-rose-600 font-extrabold tracking-wide text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => handleGridDecision(ln.lineId, "rejected")}
                                    >
                                      ODRZUCONY
                                    </button>
                                  </>
                                ) : gridActiveDecision === "ACCEPTED" ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="h-14 w-full cursor-default text-lg rounded-xl border-2 border-green-400 bg-green-100 font-extrabold tracking-wide text-green-900 opacity-100"
                                  >
                                    ✓ PRZYJĘTY
                                  </button>
                                ) : gridActiveDecision === "DAMAGED" ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="h-14 w-full cursor-default text-lg rounded-xl border-2 border-orange-500 bg-orange-200 font-extrabold tracking-wide text-orange-900 opacity-100"
                                  >
                                    USZKODZONY
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled
                                    className="h-14 w-full cursor-default text-lg rounded-xl border-2 border-red-400 bg-red-100 font-extrabold tracking-wide text-red-900 opacity-100"
                                  >
                                    ✓ ODRZUCONY
                                  </button>
                                )}
                              </div>
                            </div>
                            {showSavedDoneOverlay ? (
                              <div className={`pointer-events-none absolute inset-0 ${overlayTint}`}>
                                <div className="absolute left-1/2 top-1/2 w-full max-w-[90%] -translate-x-1/2 -translate-y-1/2 text-center">
                                  <span className="block text-7xl font-black text-white drop-shadow">{overlayIcon}</span>
                                  <span className="mt-2 inline-block rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white">
                                    {summaryText}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : activeLine ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">Widok szczegółowy uszkodzeń</h3>
                    <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setLeftViewMode("grid")}>
                      Powrót do gridu
                    </button>
                  </div>
                  {(() => {
                    const ln = activeLine;
                    const c = ln.candidate;
                    const qty = Math.floor(c.availableQuantity);
                    const meta = lineSeedByLineId.get(ln.lineId);
                    const rows =
                      unitRowsByLineId[ln.lineId] ??
                      Array.from({ length: qty }, () => ({
                        decision: null,
                        damageClass: "B" as const,
                        photoUrls: [],
                        damageTypeIds: [],
                        damageEntryId: null,
                        damageNote: null,
                      }));
                    const acceptedCountForLine = rows.filter((r) => r.decision === "ACCEPTED").length;
                    const lineRefundFull = (meta?.unitPrice ?? 0) * acceptedCountForLine;
                    const resolvedDetailCount = rows.slice(0, qty).filter((r) => r.decision != null).length;
                    const splitComplete = rows.length === qty && resolvedDetailCount === qty;
                    const splitValidPartial = rows.length === qty && resolvedDetailCount >= 1;
                    return (
                      <>
                        <div className="text-xs text-slate-600">Zwrot za przyjęte: <span className="font-semibold text-slate-900">{moneyPln(lineRefundFull)}</span></div>
                        {rows.some((r) => r.decision === "REJECTED") ? (
                          <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3">
                            <label className="mb-1 block text-xs font-semibold text-rose-900">
                              Dlaczego odrzucasz zwrot? (wymagane przy zapisie)
                            </label>
                            <select
                              className="w-full max-w-md rounded-md border border-rose-200 bg-white px-3 py-2 text-sm"
                              disabled={isFinished}
                              value={lineOverrides[ln.lineId]?.rejectReasonId ?? ""}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                applyLinePatch(ln.lineId, { rejectReasonId: v || null });
                              }}
                            >
                              <option value="">— wybierz —</option>
                              {wmsRejectReasonSelectOptions(productRejectSelectPairs)}
                            </select>
                            {lineOverrides[ln.lineId]?.rejectReasonId === WMS_REJECT_OTHER_ID ? (
                              <label className="mt-2 block text-xs font-semibold text-rose-900">
                                Uzasadnienie (wymagane)
                                <textarea
                                  className="mt-1 min-h-[88px] w-full max-w-md rounded-md border border-rose-200 bg-white px-3 py-2 text-sm"
                                  disabled={isFinished}
                                  rows={3}
                                  value={lineOverrides[ln.lineId]?.rejectReasonOtherText ?? ""}
                                  onChange={(e) =>
                                    applyLinePatch(ln.lineId, { rejectReasonOtherText: e.target.value || null })
                                  }
                                />
                              </label>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <div className="min-w-[880px]">
                            <div className="grid grid-cols-[56px_240px_minmax(200px,1fr)_1fr] bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                              <div>lp.</div>
                              <div>decyzja</div>
                              <div>klasa / typ</div>
                              <div>zdjęcie</div>
                            </div>
                            {rows.map((row, unitIdx) => {
                              const uploadKey = `${ln.lineId}:${unitIdx}`;
                              const isUploading = !!uploadingLinePhotoById[uploadKey];
                              return (
                                <div key={uploadKey} className="grid grid-cols-[56px_240px_minmax(200px,1fr)_1fr] items-start gap-2 border-t border-slate-100 px-3 py-2 text-xs">
                                  <div className="font-semibold text-slate-700">{unitIdx + 1}</div>
                                  <div className="flex items-center gap-1.5">
                                    <button type="button" disabled={isFinished} onClick={() => setUnitDecision(ln.lineId, unitIdx, "ACCEPTED")} className={`h-10 w-10 rounded-md border text-xl font-bold leading-none disabled:cursor-not-allowed disabled:opacity-50 ${row.decision === "ACCEPTED" ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-600"}`} title="Przyjęty">✓</button>
                                    <button type="button" disabled={isFinished} onClick={() => setUnitDecision(ln.lineId, unitIdx, "DAMAGED")} className={`h-10 w-10 rounded-md border text-xl font-bold leading-none disabled:cursor-not-allowed disabled:opacity-50 ${row.decision === "DAMAGED" ? "border-amber-600 bg-amber-600 text-white" : "border-slate-300 bg-white text-slate-600"}`} title="Uszkodzony">⚠</button>
                                    <button type="button" disabled={isFinished} onClick={() => setUnitDecision(ln.lineId, unitIdx, "REJECTED")} className={`h-10 w-10 rounded-md border text-xl font-bold leading-none disabled:cursor-not-allowed disabled:opacity-50 ${row.decision === "REJECTED" ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 bg-white text-slate-600"}`} title="Odrzucony">✕</button>
                                  </div>
                                  <div className="min-w-0">
                                    {row.decision === "DAMAGED" ? (
                                      <div className="flex flex-col gap-2">
                                        <div className="flex gap-1.5">
                                          <button type="button" disabled={isFinished} title={RMZ_DAMAGE_CLASS_B_TOOLTIP} onClick={() => setUnitDamageClass(ln.lineId, unitIdx, "B")} className={`rounded px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${row.damageClass === "B" ? "bg-amber-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>B</button>
                                          <button type="button" disabled={isFinished} title={RMZ_DAMAGE_CLASS_C_TOOLTIP} onClick={() => setUnitDamageClass(ln.lineId, unitIdx, "C")} className={`rounded px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${row.damageClass === "C" ? "bg-amber-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>C</button>
                                        </div>
                                        <RmzDamageTypeChips
                                          damageClass={row.damageClass}
                                          selectedIds={filterRmzDamageTypeIdsForClass(row.damageClass, row.damageTypeIds)}
                                          disabled={isFinished}
                                          className="max-w-full"
                                          onToggle={(id) => toggleUnitDamageType(ln.lineId, unitIdx, id)}
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </div>
                                  <div className="min-w-[200px] py-1">
                                    {row.decision === "DAMAGED" ? (
                                      <div className="flex flex-col gap-2">
                                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                                          <button
                                            type="button"
                                            disabled={
                                              isFinished ||
                                              isUploadingPhotos ||
                                              isUploading ||
                                              row.photoUrls.length >= MAX_DAMAGE_PHOTOS
                                            }
                                            className="min-h-[36px] rounded-lg bg-slate-900 px-2 text-[11px] font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                            onClick={() => void startCamera(row.photoUrls.length, ln.lineId, unitIdx)}
                                          >
                                            📷 Zdjęcie
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isFinished || isUploading || row.photoUrls.length >= MAX_DAMAGE_PHOTOS}
                                            className="min-h-[36px] rounded-lg bg-indigo-700 px-2 text-[11px] font-bold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                                            onClick={() => void openPhoneUploadSessionForUnit(ln.lineId, unitIdx)}
                                          >
                                            📱 Telefon
                                          </button>
                                          <label
                                            className={`flex min-h-[36px] cursor-pointer items-center justify-center rounded-lg bg-[#41546a] px-2 text-[11px] font-bold text-white hover:bg-[#36444d] ${isFinished || isUploading || row.photoUrls.length >= MAX_DAMAGE_PHOTOS ? "pointer-events-none opacity-50" : ""}`}
                                          >
                                            📁 Dysk
                                            <input
                                              type="file"
                                              accept="image/*"
                                              multiple
                                              className="hidden"
                                              disabled={isFinished || isUploading || row.photoUrls.length >= MAX_DAMAGE_PHOTOS}
                                              onChange={(e) => {
                                                void uploadUnitPhotos(ln.lineId, unitIdx, e.target.files);
                                                e.target.value = "";
                                              }}
                                            />
                                          </label>
                                        </div>
                                        {cameraActive && gridCameraLineId === ln.lineId && gridCameraUnitIndex === unitIdx ? (
                                          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                                            <video
                                              ref={videoRef}
                                              autoPlay
                                              playsInline
                                              muted
                                              className="h-32 w-full rounded bg-black object-contain"
                                            />
                                            <div className="flex flex-wrap gap-1.5">
                                              <button
                                                type="button"
                                                disabled={isFinished}
                                                className="min-h-[36px] flex-1 rounded-lg bg-emerald-700 px-2 text-xs font-extrabold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                onClick={() => captureFromCamera(ln.lineId, unitIdx)}
                                              >
                                                Zrób zdjęcie
                                              </button>
                                              <button
                                                type="button"
                                                className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                                                onClick={() => stopCamera()}
                                              >
                                                Zamknij
                                              </button>
                                            </div>
                                          </div>
                                        ) : null}
                                        {row.photoUrls.length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5">
                                            {row.photoUrls.map((u, i) => (
                                              <div key={`${u}-${i}`} className="relative">
                                                <img src={resolveDamageMediaUrl(u)} alt="" className="h-14 w-14 rounded border border-slate-200 object-cover" />
                                                <button
                                                  type="button"
                                                  disabled={isFinished}
                                                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white shadow hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                  title="Usuń"
                                                  onClick={() => removeUnitPhotoAt(ln.lineId, unitIdx, i)}
                                                >
                                                  ×
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-[11px] font-medium text-amber-700">Brak zdjęcia uszkodzenia</span>
                                        )}
                                        {isUploading ? <span className="text-[11px] text-slate-500">Wysyłanie…</span> : null}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-white/95 pt-3 backdrop-blur">
                          <div
                            className={`text-xs font-semibold ${
                              splitComplete ? "text-emerald-700" : splitValidPartial ? "text-slate-700" : "text-rose-700"
                            }`}
                          >
                            {splitComplete
                              ? "Wszystkie sztuki mają decyzję"
                              : splitValidPartial
                                ? `Częściowo: rozliczono ${resolvedDetailCount} / ${qty} szt. — zapis u góry.`
                                : "Uzupełnij co najmniej jedną decyzję dla sztuki"}
                          </div>
                          <button
                            type="button"
                            disabled
                            title="Zapisz przy użyciu przycisku w górnym pasku."
                            className="min-h-[40px] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white outline-none ring-emerald-300 opacity-45"
                            onClick={() => undefined}
                          >
                            Zapisz u góry
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : null}
            </section>
          </div>
        )}
        </div>
      </div>

      

      {phoneUploadSession && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPhoneUploadSession(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Upload zdjęcia przez telefon"
          >
            <h3 className="text-base font-semibold text-slate-900">📱 Upload z telefonu</h3>
            <p className="mt-1 text-sm text-slate-600">Zeskanuj QR i zrób zdjęcie na telefonie. Nowe zdjęcia pojawią się automatycznie.</p>
            <div className="mt-3 flex justify-center">
              <img src={phoneUploadSession.qrDataUrl} alt="QR do uploadu zdjęcia" className="h-64 w-64 rounded border border-slate-200 bg-white p-2" />
            </div>
            <a
              href={`${(getPublicBaseUrl() || `${window.location.protocol}//${window.location.hostname}:5173`).replace(/\/+$/, "")}/wms-upload/${encodeURIComponent(phoneUploadSession.sessionId)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block break-all text-center text-xs font-semibold text-blue-700 hover:underline"
            >
              {`${(getPublicBaseUrl() || `${window.location.protocol}//${window.location.hostname}:5173`).replace(/\/+$/, "")}/wms-upload/${encodeURIComponent(phoneUploadSession.sessionId)}`}
            </a>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setPhoneUploadSession(null)}
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}

      {damageLine && !isFinished && (

        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            if (!damageSaving && !isUploadingPhotos) closeDamageModal();
          }}
        >

          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.repeat) return;
              const active = document.activeElement as HTMLElement | null;
              if (active?.getAttribute?.("data-primary") === "damage-save") return;
              const t = e.target as HTMLElement;
              if (t.tagName === "SELECT" || t.tagName === "TEXTAREA") return;
              if (t.tagName === "BUTTON") {
                const tx = t.textContent?.trim() ?? "";
                if (
                  tx === "Anuluj" ||
                  tx.startsWith("Zrób zdjęcie") ||
                  tx.startsWith("Upload") ||
                  tx === "Zapisz kadr" ||
                  tx.includes("kamerę") ||
                  tx.includes("TELEFON") ||
                  tx.includes("DYSKU") ||
                  tx.includes("ZRÓB ZDJĘCIE")
                ) {
                  return;
                }
              }
              if (damageSaving || isUploadingPhotos) return;
              if ((wmsSettings?.require_photos ?? false) && damageFiles.length < 1) return;
              e.preventDefault();
              e.stopPropagation();
              void handleSaveDamage();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wms-damage-modal-title"
          >

            <h3 id="wms-damage-modal-title" className="text-base font-semibold text-slate-900">Uszkodzony</h3>

            <p className="mt-2 font-medium text-slate-900">{damageLine.candidate.productName}</p>

            {/* Minimalne info: bez dodatkowych identyfikatorów */}

            {damageSaveError && <p className="mt-2 text-sm text-rose-600">{damageSaveError}</p>}

            {isUploadingPhotos && !damageSaving && (
              <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <span
                  className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800"
                  aria-hidden
                />
                Wysyłanie zdjęcia…
              </p>
            )}

            <div className="mt-4">

              <label className="mb-1 block text-xs font-semibold text-slate-600">Ilość</label>

              <input

                type="number"

                min={1}

                max={Math.max(1, Math.floor(damageLine.candidate.availableQuantity))}

                value={damageQuantity}

                onChange={(e) => setDamageQuantity(Math.max(1, Number(e.target.value) || 1))}

                disabled={damageSaving}

                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"

              />

            </div>



            {(wmsSettings?.require_condition ?? false) && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-slate-600">Klasa uszkodzenia (wymagane)</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={damageSaving || isUploadingPhotos}
                    title={RMZ_DAMAGE_CLASS_B_TOOLTIP}
                    className={`min-h-[44px] min-w-0 flex-1 rounded-lg px-2 text-sm font-bold ${damageConditionChoice === "B" ? "bg-amber-600 text-white" : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`}
                    onClick={() => {
                      setDamageConditionChoice("B");
                      setDamageModalTypeIds((prev) => filterRmzDamageTypeIdsForClass("B", prev));
                    }}
                  >
                    KLASA B
                  </button>
                  <button
                    type="button"
                    disabled={damageSaving || isUploadingPhotos}
                    title={RMZ_DAMAGE_CLASS_C_TOOLTIP}
                    className={`min-h-[44px] min-w-0 flex-1 rounded-lg px-2 text-sm font-bold ${damageConditionChoice === "C" ? "bg-amber-700 text-white" : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`}
                    onClick={() => {
                      setDamageConditionChoice("C");
                      setDamageModalTypeIds((prev) => filterRmzDamageTypeIdsForClass("C", prev));
                    }}
                  >
                    KLASA C
                  </button>
                </div>
              </div>
            )}

            {(wmsSettings?.require_condition ?? false) && (damageConditionChoice === "B" || damageConditionChoice === "C") ? (
              <div className="mt-4">
                <RmzDamageTypeChips
                  damageClass={damageConditionChoice}
                  selectedIds={filterRmzDamageTypeIdsForClass(damageConditionChoice, damageModalTypeIds)}
                  disabled={damageSaving || isUploadingPhotos}
                  onToggle={(id) => {
                    setDamageModalTypeIds((prev) => {
                      const has = prev.includes(id);
                      const next = has ? prev.filter((x) => x !== id) : [...prev, id];
                      return filterRmzDamageTypeIdsForClass(damageConditionChoice, next);
                    });
                  }}
                />
              </div>
            ) : null}

            {/* Zdjęcia */}
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label className="block text-xs font-semibold text-slate-600">
                  {wmsSettings?.require_photos
                    ? `Zdjęcia (min. 1, max. ${MAX_DAMAGE_PHOTOS})`
                    : `Zdjęcia (opcjonalnie, max. ${MAX_DAMAGE_PHOTOS})`}
                </label>
                <span className="text-[11px] font-medium text-slate-500">
                  {damageFiles.length} / {MAX_DAMAGE_PHOTOS}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={damageSaving || isUploadingPhotos || damageFiles.length >= MAX_DAMAGE_PHOTOS}
                  className="flex min-h-[48px] min-w-0 flex-[2] items-center justify-center gap-2 rounded-xl bg-slate-900 px-2 text-xs font-bold text-white shadow-md hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 sm:px-3 sm:text-sm"
                  onClick={() => void startCamera(damageFiles.length)}
                >
                  📷 ZRÓB ZDJĘCIE
                </button>
                <button
                  type="button"
                  disabled={damageSaving || damageFiles.length >= MAX_DAMAGE_PHOTOS}
                  className="flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-2 text-xs font-bold text-white shadow-md hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
                  onClick={() => void openPhoneUploadSessionForUnit(damageLine.lineId, 0)}
                >
                  📱 TELEFON
                </button>
                <button
                  type="button"
                  disabled={damageSaving || isUploadingPhotos || damageFiles.length >= MAX_DAMAGE_PHOTOS}
                  className="flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[#41546a] px-2 text-xs font-bold text-white shadow-md hover:bg-[#36444d] disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📁 Z DYSKU
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addDamageFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              {cameraActive && gridCameraLineId == null ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-48 w-full rounded-lg bg-black object-contain"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="min-h-[44px] flex-1 rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white hover:bg-emerald-600"
                      onClick={() => captureFromCamera()}
                    >
                      Zrób zdjęcie
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] rounded-xl border-2 border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
                      onClick={() => stopCamera()}
                    >
                      Zamknij kamerę
                    </button>
                  </div>
                </div>
              ) : null}

              {damageFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {damageFiles.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      title="Kliknij, aby usunąć zdjęcie"
                      disabled={damageSaving || isUploadingPhotos}
                      className="group relative overflow-hidden rounded-md border border-slate-200 text-left outline-none ring-slate-400 focus-visible:ring-2 disabled:opacity-60"
                      onClick={() => removeDamagePhoto(f.id)}
                    >
                      <img src={resolveDamageMediaUrl(f.preview)} alt="" className="h-24 w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-bold text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
                        Usuń
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>



            {/* Operator (opcjonalnie) pominięty w uproszczonym widoku */}



            <div className="mt-5 flex justify-end gap-2">

              <button

                type="button"

                disabled={damageSaving || isUploadingPhotos}

                className="min-h-[48px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"

                onClick={closeDamageModal}

              >

                Anuluj

              </button>

              <button

                type="button"

                data-primary="damage-save"

                disabled={
                  isFinished ||
                  damageSaving ||
                  isUploadingPhotos ||
                  (!!wmsSettings?.require_condition && (damageConditionChoice !== "B" && damageConditionChoice !== "C")) ||
                  (!!wmsSettings?.require_condition &&
                    (damageConditionChoice === "B" || damageConditionChoice === "C") &&
                    filterRmzDamageTypeIdsForClass(damageConditionChoice, damageModalTypeIds).length < 1) ||
                  (!!wmsSettings?.require_photos && damageFiles.length < 1)
                }

                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#41546a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#36444d] focus-visible:ring-2 focus-visible:ring-[#41546a]/40 disabled:cursor-not-allowed disabled:opacity-45"

                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSaveDamage();
                }}

              >

                {damageSaving ? (
                  <>
                    <span
                      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                      aria-hidden
                    />
                    Zapisywanie…
                  </>
                ) : isUploadingPhotos ? (
                  <>
                    <span
                      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                      aria-hidden
                    />
                    Wysyłanie zdjęcia…
                  </>
                ) : (
                  "Potwierdź"
                )}

              </button>

            </div>

          </div>

        </div>

      )}

      <OrderDetailsModal
        open={orderDetailsModalOpen}
        onClose={() => setOrderDetailsModalOpen(false)}
        headerOrderDisplay={headerOrderDisplay}
        orderDetailCached={orderDetailCached}
        gridLoading={gridLoading}
        orderSourceFallback={orderSourceDisplay}
        customerDisplayFallback={customerDisplay}
        headerPhone={headerPhone}
        headerEmail={headerEmail}
      />

      {customerInsightsModalOpen ? (
        <div
          className="fixed inset-0 z-[128] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wms-customer-insights-title"
          onClick={() => setCustomerInsightsModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="wms-customer-insights-title" className="pr-2 text-lg font-bold leading-snug text-slate-900">
                {customerHeaderLabel}
              </h2>
              <button
                type="button"
                className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Zamknij"
                onClick={() => setCustomerInsightsModalOpen(false)}
              >
                ✕
              </button>
            </div>
            {customerInsightsData?.matched_email ? (
              <p className="mt-2 break-all text-xs text-slate-500">{customerInsightsData.matched_email}</p>
            ) : null}

            {customerInsightsLoading ? (
              <p className="mt-6 text-sm text-slate-600">Ładowanie…</p>
            ) : customerInsightsError ? (
              <p className="mt-6 text-sm leading-relaxed text-red-700">{customerInsightsError}</p>
            ) : customerInsightsData ? (
              <>
                <ul className="mt-6 list-none space-y-3 p-0 text-sm text-slate-800">
                  <li>
                    <span aria-hidden>📦</span> Zamówienia:{" "}
                    <span className="font-semibold tabular-nums">{customerInsightsData.total_orders_count}</span>
                  </li>
                  <li>
                    <span aria-hidden>↩️</span> Zwroty:{" "}
                    <span className="font-semibold tabular-nums">{customerInsightsData.total_returns_count}</span>
                  </li>
                  <li>
                    <span aria-hidden>📊</span> Zwroty:{" "}
                    <span className="font-semibold tabular-nums">
                      {(customerInsightsData.return_rate * 100).toLocaleString("pl-PL", {
                        maximumFractionDigits: 1,
                        minimumFractionDigits: 0,
                      })}
                      %
                    </span>
                  </li>
                </ul>
                <p
                  className={`mt-6 rounded-lg px-4 py-3 text-center text-sm font-semibold ${customerInsightsRiskCardClass(
                    customerInsightsData.risk_tier,
                  )}`}
                >
                  {customerInsightsData.risk_label}
                </p>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {correspondenceModalOpen ? (
        <div
          className="fixed inset-0 z-[128] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wms-correspondence-title"
          onClick={() => setCorrespondenceModalOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-[700px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <h2 id="wms-correspondence-title" className="text-lg font-bold text-slate-900">
                Korespondencja
              </h2>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Zamknij"
                onClick={() => setCorrespondenceModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="flex border-b border-slate-200 px-5">
              {(
                [
                  { id: "allegro" as const, label: "ALLEGRO" },
                  { id: "email" as const, label: "EMAIL" },
                  { id: "notes" as const, label: "NOTATKI" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCorrespondenceTab(t.id)}
                  className={`min-h-[44px] flex-1 border-b-2 px-2 py-3 text-sm font-bold uppercase tracking-wide transition ${
                    correspondenceTab === t.id
                      ? "border-green-600 text-green-800"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="min-h-[12rem] flex-1 overflow-y-auto px-5 py-5">
              {correspondenceTab === "allegro" ? (
                <p className="text-sm leading-relaxed text-slate-600">Brak wiadomości.</p>
              ) : correspondenceTab === "email" ? (
                <div className="space-y-5 text-sm">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">E-mail</p>
                    <p className="mt-1 break-all text-slate-900">{headerEmail ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Telefon</p>
                    <p className="mt-1 tabular-nums text-slate-900">{headerPhone ?? "—"}</p>
                  </div>
                  <p className="text-slate-600">Brak historii wiadomości e-mail w tym widoku.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-slate-800" htmlFor="wms-correspondence-notes">
                    Notatki
                  </label>
                  <textarea
                    id="wms-correspondence-notes"
                    rows={10}
                    value={correspondenceNotesDraft}
                    disabled={isFinished}
                    onChange={(e) => setCorrespondenceNotesDraft(e.target.value)}
                    className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                    placeholder="Notatki wewnętrzne (zapis w tej przeglądarce)…"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={`text-xs ${correspondenceNotesFlash ? "font-medium text-green-700" : "text-slate-500"}`}>
                      {correspondenceNotesFlash ? "Zapisano." : "Przyciskiem zapisujesz w pamięci przeglądarki."}
                    </p>
                    <button
                      type="button"
                      disabled={isFinished}
                      className="min-h-[40px] rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => persistCorrespondenceNotes()}
                    >
                      Zapisz notatkę
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {sellasistCallModalOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sellasist-call-info-title"
          onClick={() => setSellasistCallModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="sellasist-call-info-title" className="text-sm font-medium leading-relaxed text-slate-800">
              Połączenia niedostępne. Skonfiguruj Sellasist Call.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="min-h-[40px] rounded-lg bg-[#41546a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#36444d]"
                onClick={() => setSellasistCallModalOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>

  );

}


