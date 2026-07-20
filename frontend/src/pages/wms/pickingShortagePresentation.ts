/**
 * MULTI shortage presentation — product aggregate vs order_item/basket allocation.
 * Aggregate = summary counts only; operational copy always names order + basket.
 */

export type PickingShortageAllocation = {
  order_id: number;
  order_number: string;
  order_item_id: number;
  basket_label?: string | null;
  required_qty: number;
  picked_qty: number;
  shortage_qty: number;
  unresolved_qty: number;
};

export type ProductShortageSummary = {
  shortageUnits: number;
  ordersWithShortage: number;
  affected: PickingShortageAllocation[];
  all: PickingShortageAllocation[];
};

function fmtOrderNum(raw: string | number): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.startsWith("#") ? s : `#${s}`;
}

export function summarizeProductShortageAllocations(
  allocations: PickingShortageAllocation[] | null | undefined,
  fallbackMissingUnits = 0,
): ProductShortageSummary {
  const all = Array.isArray(allocations) ? allocations : [];
  const affected = all.filter((a) => Number(a.shortage_qty) > 1e-9);
  const fromAlloc = affected.reduce((s, a) => s + Math.max(0, Number(a.shortage_qty) || 0), 0);
  const shortageUnits = fromAlloc > 1e-9 ? fromAlloc : Math.max(0, fallbackMissingUnits);
  const orderIds = new Set(affected.map((a) => a.order_id));
  return {
    shortageUnits,
    ordersWithShortage: orderIds.size,
    affected,
    all,
  };
}

/** Compact one-liner under BRAK badge (single affected order). */
export function shortageCompactOrderBasketLine(a: PickingShortageAllocation): string {
  const ord = fmtOrderNum(a.order_number || a.order_id);
  const basket = (a.basket_label || "").trim();
  if (basket) return `Zamówienie ${ord} · ${basket}`;
  return `Zamówienie ${ord}`;
}

/** Headline for product card when shortage resolved / present. */
export function shortageProductCardHeadline(summary: ProductShortageSummary): {
  title: string;
  subtitle: string | null;
} {
  const units = summary.shortageUnits;
  const n = summary.ordersWithShortage;
  const title = `BRAK ${formatShortageQty(units)} SZT.`;
  if (n <= 0) {
    return { title, subtitle: null };
  }
  if (n === 1 && summary.affected[0]) {
    return { title, subtitle: shortageCompactOrderBasketLine(summary.affected[0]!) };
  }
  const ordersWord = n === 1 ? "ZAMÓWIENIE" : n >= 2 && n <= 4 ? "ZAMÓWIENIA" : "ZAMÓWIEŃ";
  return {
    title,
    subtitle: `${n} ${ordersWord} Z BRAKIEM`,
  };
}

export function formatShortageQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

export function allocationPresentationStatus(a: PickingShortageAllocation): {
  key: "READY" | "SHORTAGE" | "INCOMPLETE" | "ACTIVE";
  label: string;
} {
  const miss = Number(a.shortage_qty) || 0;
  const unresolved = Number(a.unresolved_qty) || 0;
  const picked = Number(a.picked_qty) || 0;
  if (unresolved > 1e-9) {
    return { key: "ACTIVE", label: "DO ZBIERANIA" };
  }
  if (miss > 1e-9 && picked <= 1e-9) {
    return { key: "SHORTAGE", label: "BRAK" };
  }
  if (miss > 1e-9) {
    return { key: "INCOMPLETE", label: "NIEKOMPLETNE" };
  }
  return { key: "READY", label: "GOTOWE" };
}
