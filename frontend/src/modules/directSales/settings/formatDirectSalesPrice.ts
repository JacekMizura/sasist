import type { PriceDisplayMode } from "../../wmsSettings/directSales/schemas/directSalesSettingsSchema";
import {
  formatResolvedLineTotalGross,
  formatResolvedSalePrice,
  resolveDirectSalesUnitPricing,
} from "../../../utils/resolvedProductPricing";

/** `unitPriceNet` is product sale net (same as `Product.sale_price` / session `unit_price`). */
export function formatDirectSalesUnitPrice(
  unitPriceNet: number | null | undefined,
  mode: PriceDisplayMode,
  marginPercent?: number | null,
  vatRate?: number | null,
): string | null {
  const pricing = resolveDirectSalesUnitPricing(unitPriceNet, marginPercent, vatRate);
  const label = formatResolvedSalePrice(pricing, mode, "");
  return label || null;
}

export function formatDirectSalesLineTotal(
  unitPriceNet: number | null | undefined,
  quantity: number,
  discountAmount: number,
  mode: PriceDisplayMode,
  marginPercent?: number | null,
  vatRate?: number | null,
): string {
  const pricing = resolveDirectSalesUnitPricing(unitPriceNet, marginPercent, vatRate);
  return formatResolvedLineTotalGross(pricing, quantity, discountAmount, mode);
}

export function formatDirectSalesMargin(marginPercent: number | null | undefined): string | null {
  if (marginPercent == null || !Number.isFinite(marginPercent)) return null;
  return `marża ${marginPercent.toFixed(1)}%`;
}

const DEFAULT_VAT_RATE = 23;

/** Format session payment total (sum of line gross totals). */
export function formatDirectSalesAggregateTotal(
  totalGross: number,
  mode: PriceDisplayMode,
  vatRate = DEFAULT_VAT_RATE,
): string {
  const totalNet = totalGross / (1 + vatRate / 100);
  if (mode === "net") return `${totalNet.toFixed(2)} zł netto`;
  if (mode === "both") return `${totalNet.toFixed(2)} / ${totalGross.toFixed(2)} zł`;
  return `${totalGross.toFixed(2)} zł`;
}
