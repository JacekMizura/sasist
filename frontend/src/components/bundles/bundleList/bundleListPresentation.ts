import type { BundleRead } from "../../../api/bundlesApi";

export function formatBundlePriceZl(b: BundleRead): string {
  const v = b.sale_price;
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(2)} zł`;
}

export function bundleStockBreakdownTooltip(b: BundleRead): string {
  if (!b.items.length) return "Brak składników";
  const lines = b.items.map((it) => {
    const nm = (it.product_name ?? `Produkt #${it.product_id}`).trim();
    const qty = Math.max(1, Math.floor(it.quantity));
    const st = it.product_stock ?? 0;
    const per = Math.floor(st / qty);
    return `${nm} — stan ${st} ÷ ${qty} = ${per} zest.`;
  });
  return `Możliwe zestawy: ${b.calculated_stock ?? 0}\n\n${lines.join("\n")}`;
}
