import type { DirectSaleSessionLine } from "../normalizeDirectSales";
import { resolveDirectSalesUnitPricing } from "../resolvedProductPricing";

/** Line total in gross (VAT-inclusive) — matches product `sale_gross` × qty. */
export function lineTotal(line: DirectSaleSessionLine): number {
  const pricing = resolveDirectSalesUnitPricing(line.unit_price, line.margin_percent);
  const grossUnit =
    pricing.saleGross ??
    (pricing.saleNet != null ? pricing.saleNet * (1 + pricing.vatRate / 100) : 0);
  return Math.max(0, grossUnit * line.quantity - line.discount_amount);
}
