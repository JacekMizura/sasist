import type { WmsPackingOrderLineApi } from "../../api/wmsPackingApi";
import {
  panelHistoryAffectedQty,
  panelHistoryOrderedQty,
  type PanelHistoryEntryLike,
} from "./panelFulfillmentHistoryDisplay";

export type PanelFulfillmentHistoryEntryUi = PanelHistoryEntryLike & {
  at?: string;
  lines?: string[];
  kind?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  product_ean?: string | null;
  order_item_id?: number | null;
};

export type RemovalTypeId =
  | "shortage"
  | "manual_oms"
  | "oms_sync"
  | "replacement"
  | "cancelled";

export type ResolvedShortageLineMeta = {
  kind: "shortage_reduced" | "order_line_removed";
  resolvedAt: string;
  removedQty: number | null;
  quantityBefore: number | null;
  reason: string;
  resolvedBy: string | null;
  fullyRemovedFromOrder: boolean;
  removalType?: RemovalTypeId | null;
};

function normToken(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function productMatchesHistoryEntry(
  opts: {
    orderItemId: number;
    productName: string;
    sku: string;
    ean: string;
    lineageMemberIds?: number[];
  },
  entry: PanelFulfillmentHistoryEntryUi,
): boolean {
  const oid = Number(entry.order_item_id ?? 0);
  if (oid > 0) {
    if (opts.lineageMemberIds?.includes(oid)) return true;
    if (oid === opts.orderItemId) return true;
    return false;
  }
  const nn = normToken(opts.productName);
  const ns = normToken(opts.sku);
  const ne = normToken(opts.ean);
  const en = normToken(entry.product_name);
  const es = normToken(entry.product_sku);
  const ee = normToken(entry.product_ean);
  if (nn && en && nn === en) return true;
  if (ns && es && ns === es) return true;
  if (ne && ee && ne === ee) return true;
  return false;
}

function parseResolvedByFromLines(lines: string[] | undefined): string | null {
  if (!lines?.length) return null;
  const blob = lines.join(" ");
  const m = blob.match(/(?:przez|operator|użytkownik|user)\s*[:\-]?\s*([^\n,.]+)/i);
  if (m?.[1]) {
    const v = m[1].trim();
    return v.length > 0 && v.length < 80 ? v : null;
  }
  return null;
}

/** Ostatnie rozwiązanie braku powiązane z linią (historia panelu OMS). */
export function findResolvedShortageForOrderLine(opts: {
  orderItemId: number;
  productName: string;
  sku?: string | null;
  ean?: string | null;
  history: PanelFulfillmentHistoryEntryUi[];
  /** Wszystkie id pozycji w tej samej linii logicznej (zamiana / archiwum). */
  lineageMemberIds?: number[];
}): ResolvedShortageLineMeta | null {
  const kinds = new Set(["shortage_reduced", "order_line_removed"]);
  for (let i = opts.history.length - 1; i >= 0; i--) {
    const e = opts.history[i];
    const k = (e.kind ?? "").trim();
    if (!kinds.has(k)) continue;
    if (
      !productMatchesHistoryEntry(
        {
          orderItemId: opts.orderItemId,
          productName: opts.productName,
          sku: opts.sku ?? "",
          ean: opts.ean ?? "",
          lineageMemberIds: opts.lineageMemberIds,
        },
        e,
      )
    ) {
      continue;
    }
    const affected = panelHistoryAffectedQty(e);
    const before = panelHistoryOrderedQty(e);
    const lines = e.lines ?? [];
    const reasonFromLines = lines.find((ln) => /powód/i.test(ln)) ?? null;
    const snap = (e as { snapshot?: { removal_type?: string } }).snapshot;
    const removalRaw = snap?.removal_type ?? "";
    const reasonText = reasonFromLines?.replace(/^powód:\s*/i, "").trim() || "";
    const removalType = inferRemovalType(removalRaw, reasonText);
    return {
      kind: k as ResolvedShortageLineMeta["kind"],
      resolvedAt: (e.at ?? "").trim() || "",
      removedQty: affected,
      quantityBefore: before,
      reason: reasonText || defaultReasonForRemovalType(removalType),
      resolvedBy: parseResolvedByFromLines(lines),
      fullyRemovedFromOrder: k === "order_line_removed" || (affected != null && before != null && affected + 1e-9 >= before),
      removalType,
    };
  }
  return null;
}

/** Linia widoczna jako „usunięta / wyzerowana przez rozwiązanie braku”. */
export function isResolvedShortageRemovedLine(opts: {
  quantity: number;
  resolved: ResolvedShortageLineMeta | null;
  shortageDisplayKind?: string | null;
}): boolean {
  const qty = Number(opts.quantity) || 0;
  const kind = (opts.shortageDisplayKind ?? "").trim().toLowerCase();
  if (opts.resolved && qty <= 1e-9) return true;
  if (kind === "resolved" && qty <= 1e-9) return true;
  if (opts.resolved?.fullyRemovedFromOrder && qty <= 1e-9) return true;
  return false;
}

/** Częściowa korekta ilości po braku (linia nadal na zamówieniu, qty > 0). */
export function isResolvedShortageReducedLine(opts: {
  quantity: number;
  resolved: ResolvedShortageLineMeta | null;
}): boolean {
  const qty = Number(opts.quantity) || 0;
  return Boolean(opts.resolved?.kind === "shortage_reduced" && qty > 1e-9);
}

function inferRemovalType(rawType: string, reason: string): RemovalTypeId {
  const t = rawType.trim().toLowerCase();
  if (t === "shortage" || t === "manual_oms" || t === "oms_sync" || t === "replacement" || t === "cancelled") {
    return t;
  }
  const r = reason.toLowerCase();
  if (r.includes("brak magazyn") || r.includes("shortage")) return "shortage";
  if (r.includes("zamian") || r.includes("zamiennik")) return "replacement";
  if (r.includes("anul")) return "cancelled";
  if (r.includes("oms") || r.includes("operator") || r.includes("ręczn")) return "manual_oms";
  return "manual_oms";
}

function defaultReasonForRemovalType(t: RemovalTypeId): string {
  switch (t) {
    case "shortage":
      return "brak magazynowy";
    case "replacement":
      return "zamiana produktu";
    case "cancelled":
      return "anulowano";
    case "oms_sync":
      return "synchronizacja OMS";
    default:
      return "usunięto z zamówienia (OMS)";
  }
}

export function resolvedShortageHeadline(meta: ResolvedShortageLineMeta): string {
  const t = meta.removalType ?? inferRemovalType("", meta.reason);
  switch (t) {
    case "shortage":
      return "Usunięto podczas obsługi braków magazynowych.";
    case "replacement":
      return "Linia zarchiwizowana po zamianie produktu.";
    case "manual_oms":
    case "oms_sync":
      return "Pozycja usunięta ręcznie z zamówienia (OMS).";
    default:
      return "Pozycja usunięta z zamówienia.";
  }
}

export function resolvedShortageFooter(meta: ResolvedShortageLineMeta | null): string {
  if (!meta) return "Pozycja usunięta z kompletacji.";
  const t = meta.removalType ?? inferRemovalType("", meta.reason);
  switch (t) {
    case "shortage":
      return "Pozycja usunięta z kompletacji z powodu braków magazynowych.";
    case "manual_oms":
    case "oms_sync":
      return "Pozycja usunięta z zamówienia przez operatora / OMS.";
    default:
      return resolvedShortageHeadline(meta);
  }
}

export function resolvedShortageBadgeLabel(meta: ResolvedShortageLineMeta): string {
  const t = meta.removalType ?? inferRemovalType("", meta.reason);
  if (meta.kind === "shortage_reduced" && !meta.fullyRemovedFromOrder) {
    return "BRAKI — USUNIĘTY";
  }
  switch (t) {
    case "shortage":
      return "USUNIĘTO Z POWODU BRAKÓW MAGAZYNOWYCH";
    case "replacement":
      return "USUNIĘTO (ZAMIANA)";
    case "cancelled":
      return "USUNIĘTO (ANULOWANO)";
    case "oms_sync":
      return "USUNIĘTO (SYNCH. OMS)";
    default:
      return "USUNIĘTO Z ZAMÓWIENIA (OMS)";
  }
}

export function pickShortageDisplayKind(wm: WmsPackingOrderLineApi | undefined): string | null {
  return wm?.shortage_display_kind ?? null;
}
