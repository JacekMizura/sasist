import type { CustomerReturnOrderLite } from "./customerReturnFormTypes";

export function customerReturnUnitPrice(
  item: NonNullable<CustomerReturnOrderLite["items"]>[number],
): number {
  const candidates = [item.unit_price_gross, item.unit_price, item.unit_price_net, item.list_price];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

export function customerReturnMoney(n: number): string {
  return `${n.toFixed(2)} zł`;
}

export function customerReturnFormatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function customerReturnCustomerName(order: CustomerReturnOrderLite): string {
  const fromCustomer = (order.customer?.display_name || "").trim();
  if (fromCustomer) return fromCustomer;
  return [order.first_name, order.last_name].filter(Boolean).join(" ").trim() || "Klient";
}

export function customerReturnEligibleItems(order: CustomerReturnOrderLite) {
  return (order.items ?? []).filter((it) => {
    if (it.is_bundle_parent) return false;
    if (!it.product?.id) return false;
    return (Number(it.quantity) || 0) > 0;
  });
}
