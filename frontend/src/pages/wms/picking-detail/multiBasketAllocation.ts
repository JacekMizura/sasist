/**
 * Per-order / per-basket allocation math for MULTI basket-put detail.
 * Invariant per line: required = picked + shortage + unresolved.
 */

export type MultiBasketOrderAllocation = {
  order_id: number;
  order_item_id: number | null | undefined;
  order_number: string;
  basket_slot?: string | null;
  quantity: number;
  picked_quantity: number;
  missing_quantity: number;
  quantity_to_pick?: number;
  shortage_declarable_qty?: number;
};

export type MultiBasketLineStatus =
  | "ACTIVE"
  | "PARTIAL_PICK"
  | "READY"
  | "PARTIAL_SHORTAGE"
  | "FULL_SHORTAGE";

export function allocationUnresolved(o: MultiBasketOrderAllocation): number {
  if (typeof o.quantity_to_pick === "number" && Number.isFinite(o.quantity_to_pick)) {
    return Math.max(0, o.quantity_to_pick);
  }
  const req = Math.max(0, Number(o.quantity) || 0);
  const picked = Math.max(0, Number(o.picked_quantity) || 0);
  const miss = Math.max(0, Number(o.missing_quantity) || 0);
  return Math.max(0, req - picked - miss);
}

export function allocationLineStatus(o: MultiBasketOrderAllocation): MultiBasketLineStatus {
  const req = Math.max(0, Number(o.quantity) || 0);
  const picked = Math.max(0, Number(o.picked_quantity) || 0);
  const miss = Math.max(0, Number(o.missing_quantity) || 0);
  const unresolved = allocationUnresolved(o);
  if (unresolved > 1e-9) {
    if (picked > 1e-9 || miss > 1e-9) return "PARTIAL_PICK";
    return "ACTIVE";
  }
  if (miss > 1e-9 && picked <= 1e-9) return "FULL_SHORTAGE";
  if (miss > 1e-9 && picked > 1e-9) return "PARTIAL_SHORTAGE";
  if (req > 1e-9 && picked + 1e-9 >= req) return "READY";
  return "READY";
}

export function allocationStatusLabel(status: MultiBasketLineStatus): string {
  switch (status) {
    case "READY":
      return "GOTOWE";
    case "PARTIAL_SHORTAGE":
      return "NIEKOMPLETNE";
    case "FULL_SHORTAGE":
      return "BRAK";
    case "PARTIAL_PICK":
      return "CZĘŚCIOWO";
    default:
      return "DO ZBIERANIA";
  }
}

export function aggregateAllocations(orders: MultiBasketOrderAllocation[]): {
  required: number;
  picked: number;
  shortage: number;
  unresolved: number;
} {
  let required = 0;
  let picked = 0;
  let shortage = 0;
  let unresolved = 0;
  for (const o of orders) {
    required += Math.max(0, Number(o.quantity) || 0);
    picked += Math.max(0, Number(o.picked_quantity) || 0);
    shortage += Math.max(0, Number(o.missing_quantity) || 0);
    unresolved += allocationUnresolved(o);
  }
  return { required, picked, shortage, unresolved };
}

export function unresolvedAllocations(orders: MultiBasketOrderAllocation[]): MultiBasketOrderAllocation[] {
  return orders.filter((o) => allocationUnresolved(o) > 1e-9 && (o.order_item_id ?? 0) > 0);
}
