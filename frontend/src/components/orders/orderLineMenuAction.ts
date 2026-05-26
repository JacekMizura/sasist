import type { OrderSummaryProductItem } from "./OrderSummaryProductsList";

/** Stabilne ID pozycji zamówienia z obiektu listy (API czasem zwraca string). */
export function orderLineItemId(item: { id?: unknown } | null | undefined): number | null {
  const n = Number(item?.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function findOrderItemForMenuAction<T extends { id?: unknown }>(
  orderItems: T[],
  item: OrderSummaryProductItem,
): T | undefined {
  const id = orderLineItemId(item);
  if (id == null) return undefined;
  return orderItems.find((x) => Number(x.id) === id);
}

export function orderLineMenuLockedMessage(
  full:
    | {
        oms_line_status?: string | null;
        quantity?: number | null;
      }
    | undefined,
  opts?: { resolvedShortageRemoved?: boolean },
): string | null {
  if (opts?.resolvedShortageRemoved) {
    return "Pozycja zamknięta — usunięta przez rozwiązanie braku magazynowego.";
  }
  if (!full) return null;
  const ols = (full.oms_line_status ?? "").trim().toUpperCase();
  if (ols === "REPLACED") return "Nie można edytować archiwalnej pozycji.";
  return null;
}
