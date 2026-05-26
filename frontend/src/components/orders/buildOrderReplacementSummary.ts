import type { WmsPackingOrderLineApi } from "../../api/wmsPackingApi";
import { fmtOmsQty } from "./omsFulfillmentLinePresentation";

export type OrderItemLike = {
  id: number;
  quantity: number;
  unit_price?: number | null;
  total_price?: number | null;
  oms_replacement_original_quantity?: number | null;
  oms_replacement_transferred_quantity?: number | null;
  product?: {
    name?: string | null;
    ean?: string | null;
    symbol?: string | null;
    sku?: string | null;
    image_url?: string | null;
  };
};

function skuLabel(p?: OrderItemLike["product"]): string {
  const s = (p?.symbol ?? p?.sku ?? "").trim();
  return s || "—";
}

function eanLabel(p?: OrderItemLike["product"]): string {
  const s = (p?.ean ?? "").trim();
  return s || "—";
}

function transferredReplacementQty(it: OrderItemLike): number {
  const tq = it.oms_replacement_transferred_quantity;
  if (tq != null && Number.isFinite(Number(tq)) && Number(tq) > 0) return Math.round(Number(tq));
  const oq = it.oms_replacement_original_quantity;
  if (oq != null && Number.isFinite(Number(oq)) && Number(oq) > 0) return Math.round(Number(oq));
  return 0;
}

function oldTransferredLineValue(it: OrderItemLike): number | null {
  const transQ = transferredReplacementQty(it);
  if (transQ <= 0) return null;
  const origQ = it.oms_replacement_original_quantity != null ? Number(it.oms_replacement_original_quantity) : 0;
  const tp = it.total_price != null ? Number(it.total_price) : null;
  const up = it.unit_price != null ? Number(it.unit_price) : null;
  if (origQ > 0 && tp != null && Number.isFinite(tp)) {
    return (transQ / origQ) * tp;
  }
  if (up != null && Number.isFinite(up)) {
    return transQ * up;
  }
  return null;
}

export type OrderReplacementPair = {
  /** Id linii źródłowej (REPLACED, qty 0) — stabilny klucz UI */
  sourceOrderItemId: number;
  fromLabel: string;
  toLabel: string;
  qtyDisplay: string;
  oldName: string;
  oldSku: string;
  oldEan: string;
  oldQty: number;
  oldUnitPrice: number | null;
  oldLineValue: number | null;
  newName: string;
  newSku: string;
  newEan: string;
  newQty: number;
  newUnitPrice: number | null;
  newLineValue: number | null;
  /** new − old transferred value */
  valueDelta: number | null;
};

/**
 * Jedna pozycja listy „Zamiany w zamówieniu” na podstawie linii REPLACED + następcy (zamiennik).
 */
export function getReplacementSuccessorItem(
  replacedSourceItemId: number,
  items: OrderItemLike[],
  wmsByItemId: Map<number, WmsPackingOrderLineApi>,
): OrderItemLike | undefined {
  return items.find((x) => (wmsByItemId.get(x.id)?.replaced_from_order_item_id ?? 0) === replacedSourceItemId);
}

export function buildOrderReplacementPairs(
  items: OrderItemLike[],
  wmsByItemId: Map<number, WmsPackingOrderLineApi>,
): OrderReplacementPair[] {
  const out: OrderReplacementPair[] = [];
  for (const it of items) {
    const wm = wmsByItemId.get(it.id);
    const ols = (wm?.oms_line_status ?? "").trim().toUpperCase();
    const qty = Number(it.quantity ?? 0);
    if (ols !== "REPLACED" || qty > 1e-9) continue;

    const fromLabel = (it.product?.name ?? wm?.product_name ?? "—").trim() || "—";
    const successor = getReplacementSuccessorItem(it.id, items, wmsByItemId);
    const wx = successor ? wmsByItemId.get(successor.id) : undefined;
    const toLabel =
      (successor?.product?.name ?? "").trim() ||
      (wx?.product_name ?? "").trim() ||
      (wm?.replacement_new_product_name ?? "").trim() ||
      "—";
    const sq = successor ? Number(successor.quantity ?? 0) : 0;
    const qtyDisplay = sq > 1e-9 ? `${fmtOmsQty(sq)} szt.` : "—";
    const oldQty = transferredReplacementQty(it);
    const oldUnit = it.unit_price != null && Number.isFinite(Number(it.unit_price)) ? Number(it.unit_price) : null;
    const oldLineVal = oldTransferredLineValue(it);
    const newUnit =
      successor?.unit_price != null && Number.isFinite(Number(successor.unit_price))
        ? Number(successor.unit_price)
        : null;
    const newLineVal =
      successor?.total_price != null && Number.isFinite(Number(successor.total_price))
        ? Number(successor.total_price)
        : null;
    let valueDelta: number | null = null;
    if (oldLineVal != null && newLineVal != null) {
      valueDelta = newLineVal - oldLineVal;
    }
    out.push({
      sourceOrderItemId: it.id,
      fromLabel,
      toLabel,
      qtyDisplay,
      oldName: fromLabel,
      oldSku: skuLabel(it.product),
      oldEan: eanLabel(it.product),
      oldQty,
      oldUnitPrice: oldUnit,
      oldLineValue: oldLineVal,
      newName: toLabel,
      newSku: successor ? skuLabel(successor.product) : "—",
      newEan: successor ? eanLabel(successor.product) : "—",
      newQty: sq > 1e-9 ? Math.round(sq) : 0,
      newUnitPrice: newUnit,
      newLineValue: newLineVal,
      valueDelta,
    });
  }
  return out;
}
