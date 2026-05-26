import type { WmsPackingOrderLineApi } from "../../api/wmsPackingApi";
import { getReplacementSuccessorItem, type OrderItemLike } from "./buildOrderReplacementSummary";
import type { PanelFulfillmentHistoryEntryUi } from "./orderLineResolvedShortage";
import {
  findResolvedShortageForOrderLine,
  isResolvedShortageRemovedLine,
  type ResolvedShortageLineMeta,
} from "./orderLineResolvedShortage";

export type LogicalOrderItemMember = OrderItemLike & {
  parent_bundle_order_item_id?: number | null;
  replaced_from_order_item_id?: number | null;
};

export type LogicalOrderEventKind =
  | "shortage_reduced"
  | "order_line_removed"
  | "replacement"
  | "panel_note";

export type LogicalOrderEvent = {
  id: string;
  at: string;
  kind: LogicalOrderEventKind;
  label: string;
  detail?: string;
  orderItemId?: number;
};

export type LogicalOrderItemGroup = {
  /** Stabilny klucz linii (korzeń łańcucha zamian). */
  lineageRootId: number;
  /** Id pozycji używanej do karty, WMS i akcji menu. */
  canonicalOrderItemId: number;
  memberOrderItemIds: number[];
  archivedOrderItemIds: number[];
  timeline: LogicalOrderEvent[];
  resolvedShortage: ResolvedShortageLineMeta | null;
  hasActiveQty: boolean;
  isReplacementLineage: boolean;
};

function wmsRepFrom(
  itemId: number,
  item: LogicalOrderItemMember | undefined,
  wmsByItemId: Map<number, WmsPackingOrderLineApi>,
): number {
  const fromItem = Number(item?.replaced_from_order_item_id ?? 0);
  if (fromItem > 0) return fromItem;
  return Number(wmsByItemId.get(itemId)?.replaced_from_order_item_id ?? 0);
}

/** Korzeń łańcucha zamian (pierwotna pozycja zamówienia). */
export function resolveLineageRootId(
  itemId: number,
  itemsById: Map<number, LogicalOrderItemMember>,
  wmsByItemId: Map<number, WmsPackingOrderLineApi>,
): number {
  const seen = new Set<number>();
  let cur = itemId;
  while (true) {
    if (seen.has(cur)) return itemId;
    seen.add(cur);
    const rep = wmsRepFrom(cur, itemsById.get(cur), wmsByItemId);
    if (rep > 0 && itemsById.has(rep)) {
      cur = rep;
      continue;
    }
    return cur;
  }
}

function lineStatus(
  itemId: number,
  item: LogicalOrderItemMember | undefined,
  wmsByItemId: Map<number, WmsPackingOrderLineApi>,
): string {
  return (wmsByItemId.get(itemId)?.oms_line_status ?? item?.oms_line_status ?? "").trim().toUpperCase();
}

/** Wybiera jedną pozycję do wyświetlenia na karcie (bieżący stan, nie archiwum). */
export function pickCanonicalOrderItemId(
  memberIds: number[],
  itemsById: Map<number, LogicalOrderItemMember>,
  wmsByItemId: Map<number, WmsPackingOrderLineApi>,
): number {
  const scored = memberIds.map((id) => {
    const it = itemsById.get(id);
    const qty = Number(it?.quantity ?? 0);
    const ols = lineStatus(id, it, wmsByItemId);
    const repFrom = wmsRepFrom(id, it, wmsByItemId);
    let score = 0;
    if (qty > 1e-9 && ols !== "REPLACED") score += 1000 + qty;
    else if (qty > 1e-9 && repFrom > 0) score += 800 + qty;
    else if (ols === "REPLACED") score += 100;
    else score += 50 + qty;
    return { id, score };
  });
  scored.sort((a, b) => b.score - a.score || b.id - a.id);
  return scored[0]?.id ?? memberIds[0];
}

function historyMatchesLineage(
  entry: PanelFulfillmentHistoryEntryUi,
  lineageRootId: number,
  memberIds: Set<number>,
): boolean {
  const oid = Number(entry.order_item_id ?? 0);
  if (oid > 0) {
    if (memberIds.has(oid)) return true;
    return oid === lineageRootId;
  }
  return false;
}

function buildPanelTimelineEvents(
  history: PanelFulfillmentHistoryEntryUi[],
  lineageRootId: number,
  memberIds: Set<number>,
): LogicalOrderEvent[] {
  const out: LogicalOrderEvent[] = [];
  history.forEach((entry, idx) => {
    if (!historyMatchesLineage(entry, lineageRootId, memberIds)) return;
    const kindRaw = (entry.kind ?? "").trim();
    const kind: LogicalOrderEventKind =
      kindRaw === "order_line_removed"
        ? "order_line_removed"
        : kindRaw === "shortage_reduced"
          ? "shortage_reduced"
          : "panel_note";
    const label =
      kind === "order_line_removed"
        ? "Usunięto z zamówienia (brak)"
        : kind === "shortage_reduced"
          ? "Zmniejszono ilość (brak)"
          : entry.lines?.[0]?.trim() || "Zdarzenie magazynowe";
    out.push({
      id: `panel-${lineageRootId}-${idx}-${entry.at ?? ""}`,
      at: (entry.at ?? "").trim(),
      kind,
      label,
      detail: entry.lines?.slice(1).join(" · ") || undefined,
      orderItemId: entry.order_item_id ?? undefined,
    });
  });
  return out;
}

function buildReplacementTimelineEvent(
  lineageRootId: number,
  memberIds: number[],
  items: LogicalOrderItemMember[],
  wmsByItemId: Map<number, WmsPackingOrderLineApi>,
): LogicalOrderEvent | null {
  const replaced = memberIds.find((id) => {
    const it = items.find((x) => x.id === id);
    const qty = Number(it?.quantity ?? 0);
    return lineStatus(id, it, wmsByItemId) === "REPLACED" && qty <= 1e-9;
  });
  if (!replaced) return null;
  const successor = getReplacementSuccessorItem(replaced, items, wmsByItemId);
  if (!successor) return null;
  const oldIt = items.find((x) => x.id === replaced);
  const oldName = (oldIt?.product?.name ?? wmsByItemId.get(replaced)?.product_name ?? "—").trim();
  const newName =
    (successor.product?.name ?? wmsByItemId.get(successor.id)?.product_name ?? "—").trim() || "—";
  return {
    id: `replacement-${lineageRootId}-${replaced}-${successor.id}`,
    at: "",
    kind: "replacement",
    label: "Zamiana produktu",
    detail: `${oldName} → ${newName}`,
    orderItemId: replaced,
  };
}

export function buildLogicalOrderItemGroups(opts: {
  items: LogicalOrderItemMember[];
  wmsByItemId: Map<number, WmsPackingOrderLineApi>;
  panelHistory: PanelFulfillmentHistoryEntryUi[];
}): LogicalOrderItemGroup[] {
  const { items, wmsByItemId, panelHistory } = opts;
  const itemsById = new Map(items.map((it) => [it.id, it]));
  const lineageMembers = new Map<number, number[]>();

  for (const it of items) {
    if (it.parent_bundle_order_item_id != null) continue;
    const root = resolveLineageRootId(it.id, itemsById, wmsByItemId);
    const list = lineageMembers.get(root) ?? [];
    if (!list.includes(it.id)) list.push(it.id);
    lineageMembers.set(root, list);
  }

  const groups: LogicalOrderItemGroup[] = [];
  for (const [lineageRootId, memberOrderItemIds] of lineageMembers) {
    const memberSet = new Set(memberOrderItemIds);
    const canonicalOrderItemId = pickCanonicalOrderItemId(memberOrderItemIds, itemsById, wmsByItemId);
    const archivedOrderItemIds = memberOrderItemIds.filter((id) => id !== canonicalOrderItemId);
    const canonicalItem = itemsById.get(canonicalOrderItemId);
    const canonicalWm = wmsByItemId.get(canonicalOrderItemId);
    const nameForMatch =
      (canonicalWm?.product_name ?? canonicalItem?.product?.name ?? "—").trim() || "—";

    const resolvedShortage = findResolvedShortageForOrderLine({
      orderItemId: canonicalOrderItemId,
      productName: nameForMatch,
      sku: canonicalItem?.product?.sku ?? canonicalWm?.sku,
      ean: canonicalItem?.product?.ean ?? canonicalWm?.ean,
      history: panelHistory,
      lineageMemberIds: memberOrderItemIds,
    });

    const timeline: LogicalOrderEvent[] = [
      ...buildPanelTimelineEvents(panelHistory, lineageRootId, memberSet),
    ];
    const repl = buildReplacementTimelineEvent(lineageRootId, memberOrderItemIds, items, wmsByItemId);
    if (repl) timeline.push(repl);

    timeline.sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      return tb - ta;
    });

    const qty = Number(canonicalItem?.quantity ?? 0);
    const hasActiveQty = qty > 1e-9;
    const isReplacementLineage = memberOrderItemIds.some((id) => wmsRepFrom(id, itemsById.get(id), wmsByItemId) > 0);

    groups.push({
      lineageRootId,
      canonicalOrderItemId,
      memberOrderItemIds,
      archivedOrderItemIds,
      timeline,
      resolvedShortage,
      hasActiveQty,
      isReplacementLineage,
    });
  }

  groups.sort((a, b) => a.lineageRootId - b.lineageRootId);
  return groups;
}

/** Czy grupa ma być na liście produktów (jedna karta). */
export function isLogicalOrderGroupVisible(
  group: LogicalOrderItemGroup,
  showZeroQtyHistoryRows: boolean,
  wmsByItemId: Map<number, WmsPackingOrderLineApi>,
  itemsById: Map<number, LogicalOrderItemMember>,
): boolean {
  const canonical = itemsById.get(group.canonicalOrderItemId);
  const qty = Number(canonical?.quantity ?? 0);
  const wm = wmsByItemId.get(group.canonicalOrderItemId);

  if (group.hasActiveQty) return true;

  const resolvedRemoved = isResolvedShortageRemovedLine({
    quantity: qty,
    resolved: group.resolvedShortage,
    shortageDisplayKind: wm?.shortage_display_kind,
  });

  if (!showZeroQtyHistoryRows) {
    if (resolvedRemoved) return true;
    if (Number(wm?.missing_quantity ?? 0) > 1e-6) return true;
    return false;
  }

  if (resolvedRemoved || group.timeline.length > 0) return true;
  if (lineStatus(group.canonicalOrderItemId, canonical, wmsByItemId) === "REPLACED") {
    return group.isReplacementLineage;
  }
  return false;
}

export function countDistinctLogicalHistoryEvents(groups: LogicalOrderItemGroup[]): number {
  const keys = new Set<string>();
  for (const g of groups) {
    for (const ev of g.timeline) {
      keys.add(`${ev.kind}:${ev.at}:${ev.label}:${ev.orderItemId ?? ""}`);
    }
  }
  return keys.size;
}
