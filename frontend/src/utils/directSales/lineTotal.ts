import type { DirectSaleSessionLine } from "../normalizeDirectSales";

export function lineTotal(line: DirectSaleSessionLine): number {
  const unit = line.unit_price ?? 0;
  return Math.max(0, unit * line.quantity - line.discount_amount);
}
