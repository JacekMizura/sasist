const STORAGE_PREFIX = "order_header_linked_orders:";

export type OrderHeaderLinkedOrder = {
  id: number;
  number: string;
  linkedAt: string;
};

function storageKey(orderId: number): string {
  return `${STORAGE_PREFIX}${orderId}`;
}

/** Provisional client-side store until order↔order link API lands. */
export function readLinkedOrders(orderId: number): OrderHeaderLinkedOrder[] {
  try {
    const raw = window.localStorage.getItem(storageKey(orderId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const r = row as Partial<OrderHeaderLinkedOrder>;
        const id = Number(r.id);
        if (!Number.isFinite(id) || id <= 0) return null;
        return {
          id,
          number: String(r.number ?? id),
          linkedAt: String(r.linkedAt ?? new Date().toISOString()),
        };
      })
      .filter((x): x is OrderHeaderLinkedOrder => x != null);
  } catch {
    return [];
  }
}

export function writeLinkedOrders(orderId: number, rows: OrderHeaderLinkedOrder[]): void {
  try {
    window.localStorage.setItem(storageKey(orderId), JSON.stringify(rows));
  } catch {
    //
  }
}

export function linkOrderLocally(
  sourceOrderId: number,
  target: { id: number; number: string },
): OrderHeaderLinkedOrder[] {
  const current = readLinkedOrders(sourceOrderId).filter((r) => r.id !== target.id);
  const next = [
    { id: target.id, number: target.number, linkedAt: new Date().toISOString() },
    ...current,
  ];
  writeLinkedOrders(sourceOrderId, next);
  return next;
}

export function unlinkOrderLocally(sourceOrderId: number, targetId: number): OrderHeaderLinkedOrder[] {
  const next = readLinkedOrders(sourceOrderId).filter((r) => r.id !== targetId);
  writeLinkedOrders(sourceOrderId, next);
  return next;
}
