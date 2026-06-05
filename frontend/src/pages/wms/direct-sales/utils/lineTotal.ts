import type { DirectSaleSession } from "../services/directSalesApi";

export function lineTotal(line: DirectSaleSession["lines"][number]): number {
  const unit = line.unit_price ?? 0;
  return Math.max(0, unit * line.quantity - line.discount_amount);
}
