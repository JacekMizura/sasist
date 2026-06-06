/**
 * Single source of truth for product pricing display (list, detail, direct sales, sidebars).
 * UI must not read raw price fields or compute gross/margin independently.
 */

import type { ProductListRow } from "../types/productListRow";

const DEFAULT_VAT_PERCENT = 23;

/** Canonical pricing DTO — all views consume only this shape. */
export type ResolvedProductPricing = {
  saleNet: number | null;
  saleGross: number | null;
  purchaseNet: number | null;
  purchaseGross: number | null;
  vatRate: number;
  marginValue: number | null;
  marginPercent: number | null;
};

/** Extended display helpers derived from ResolvedProductPricing. */
export type ProductPricingDisplay = ResolvedProductPricing & {
  landedCostNet: number | null;
  vatLabel: string;
  marginLabel: string;
  hasCostData: boolean;
};

export type ProductCostLike = {
  purchase_net?: number | null;
  purchase_gross?: number | null;
  landed_cost_net?: number | null;
  vat_percent?: number | null;
  sale_net?: number | null;
  sale_gross?: number | null;
  margin_value?: number | null;
  margin_percent?: number | null;
} | null | undefined;

export type PriceDisplayMode = "gross" | "net" | "both";

function finiteNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function grossFromNet(net: number | null, vatPercent: number): number | null {
  if (net == null) return null;
  return Math.round(net * (1 + vatPercent / 100) * 100) / 100;
}

function parseVatPercent(currentCost: ProductCostLike, metadataVatRate: string): { percent: number; fromDefault: boolean } {
  const fromCost = finiteNum(currentCost?.vat_percent);
  if (fromCost != null && fromCost >= 0) return { percent: fromCost, fromDefault: false };
  const raw = metadataVatRate.trim().replace(",", ".");
  if (raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return { percent: n, fromDefault: false };
  }
  return { percent: DEFAULT_VAT_PERCENT, fromDefault: true };
}

function vatRateFromMetadata(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata || typeof metadata !== "object") return "";
  const ui = metadata.product_ui;
  if (ui && typeof ui === "object" && !Array.isArray(ui)) {
    const v = (ui as Record<string, unknown>).vat_rate;
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

export function resolveProductPricingDisplay(args: {
  currentCost?: ProductCostLike;
  salePrice?: number | "" | null;
  purchasePrice?: number | "" | null;
  metadataVatRate?: string;
  extraCostPackagingNet?: number | "" | null;
  extraCostCommissionPercent?: number | "" | null;
  extraCostOtherNet?: number | "" | null;
}): ProductPricingDisplay {
  const { currentCost, metadataVatRate = "" } = args;
  const { percent: vatPercent, fromDefault } = parseVatPercent(currentCost, metadataVatRate);
  const vatLabel = fromDefault ? `${vatPercent}% (domyślny)` : `${vatPercent}%`;

  const saleNet = finiteNum(currentCost?.sale_net) ?? finiteNum(args.salePrice);
  const purchaseNet = finiteNum(currentCost?.purchase_net) ?? finiteNum(args.purchasePrice);

  const packaging = finiteNum(args.extraCostPackagingNet) ?? 0;
  const commissionPct = finiteNum(args.extraCostCommissionPercent) ?? 0;
  const other = finiteNum(args.extraCostOtherNet) ?? 0;
  const commissionCost = saleNet != null ? (saleNet * commissionPct) / 100 : 0;
  const extraCostNet = packaging + other + commissionCost;

  let landedCostNet = finiteNum(currentCost?.landed_cost_net);
  if (landedCostNet == null && purchaseNet != null) {
    landedCostNet = Math.round((purchaseNet + extraCostNet) * 100) / 100;
  }

  const saleGross = finiteNum(currentCost?.sale_gross) ?? grossFromNet(saleNet, vatPercent);
  const purchaseGross = finiteNum(currentCost?.purchase_gross) ?? grossFromNet(purchaseNet, vatPercent);

  let marginValue = finiteNum(currentCost?.margin_value);
  let marginPercent = finiteNum(currentCost?.margin_percent);
  if (marginValue == null && saleNet != null && landedCostNet != null) {
    marginValue = Math.round((saleNet - landedCostNet) * 100) / 100;
  }
  if (marginPercent == null && marginValue != null && saleNet != null && saleNet > 1e-9) {
    marginPercent = Math.round((marginValue / saleNet) * 10000) / 100;
  }

  const hasCostData = purchaseNet != null || landedCostNet != null;

  let marginLabel = "—";
  if (marginPercent != null) {
    marginLabel = `${marginPercent.toFixed(1)}%`;
  } else if (saleNet == null) {
    marginLabel = "brak ceny sprzedaży";
  } else if (!hasCostData) {
    marginLabel = "brak danych kosztu";
  } else if (landedCostNet == null) {
    marginLabel = "brak danych";
  }

  return {
    saleNet,
    saleGross,
    purchaseNet,
    purchaseGross,
    vatRate: vatPercent,
    marginValue,
    marginPercent,
    landedCostNet,
    vatLabel,
    marginLabel,
    hasCostData,
  };
}

/** Resolve pricing from API list/detail row (`current_cost` + legacy fields). */
export function resolveProductPricingFromRow(row: Pick<
  ProductListRow,
  | "sale_price"
  | "purchase_price"
  | "current_cost"
  | "metadata_json"
  | "extra_cost_packaging_net"
  | "extra_cost_commission_percent"
  | "extra_cost_other_net"
>): ResolvedProductPricing {
  const display = resolveProductPricingDisplay({
    currentCost: row.current_cost ?? undefined,
    salePrice: row.sale_price,
    purchasePrice: row.purchase_price,
    metadataVatRate: vatRateFromMetadata(row.metadata_json ?? null),
    extraCostPackagingNet: row.extra_cost_packaging_net,
    extraCostCommissionPercent: row.extra_cost_commission_percent,
    extraCostOtherNet: row.extra_cost_other_net,
  });
  return {
    saleNet: display.saleNet,
    saleGross: display.saleGross,
    purchaseNet: display.purchaseNet,
    purchaseGross: display.purchaseGross,
    vatRate: display.vatRate,
    marginValue: display.marginValue,
    marginPercent: display.marginPercent,
  };
}

/**
 * Direct sales stores `unit_price` as product sale net (same as `Product.sale_price`).
 */
export function resolveDirectSalesUnitPricing(
  unitPriceNet: number | null | undefined,
  marginPercent?: number | null,
  vatRate?: number | null,
): ResolvedProductPricing {
  const display = resolveProductPricingDisplay({
    salePrice: unitPriceNet,
    metadataVatRate: vatRate != null && Number.isFinite(vatRate) ? String(vatRate) : "",
    currentCost: marginPercent != null ? { margin_percent: marginPercent } : undefined,
  });
  return {
    saleNet: display.saleNet,
    saleGross: display.saleGross,
    purchaseNet: display.purchaseNet,
    purchaseGross: display.purchaseGross,
    vatRate: display.vatRate,
    marginValue: display.marginValue,
    marginPercent: display.marginPercent ?? marginPercent ?? null,
  };
}

export function formatMoneyZlDisplay(v: number | null | undefined, emptyLabel = "brak danych"): string {
  if (v == null || Number.isNaN(Number(v))) return emptyLabel;
  return `${Number(v).toFixed(2)} zł`;
}

export function formatResolvedSalePrice(
  pricing: Pick<ResolvedProductPricing, "saleNet" | "saleGross">,
  mode: PriceDisplayMode,
  emptyLabel = "—",
): string {
  const { saleNet, saleGross } = pricing;
  if (mode === "net") {
    return saleNet != null ? `${saleNet.toFixed(2)} zł netto` : emptyLabel;
  }
  if (mode === "both") {
    if (saleNet != null && saleGross != null) return `${saleNet.toFixed(2)} / ${saleGross.toFixed(2)} zł`;
    if (saleGross != null) return `${saleGross.toFixed(2)} zł`;
    if (saleNet != null) return `${saleNet.toFixed(2)} zł netto`;
    return emptyLabel;
  }
  return saleGross != null ? `${saleGross.toFixed(2)} zł` : saleNet != null ? `${saleNet.toFixed(2)} zł netto` : emptyLabel;
}

export function formatResolvedLineTotalGross(
  pricing: Pick<ResolvedProductPricing, "saleGross" | "saleNet" | "vatRate">,
  quantity: number,
  discountAmount: number,
  mode: PriceDisplayMode,
): string {
  const grossUnit = pricing.saleGross ?? grossFromNet(pricing.saleNet, pricing.vatRate) ?? 0;
  const totalGross = Math.max(0, grossUnit * quantity - discountAmount);
  const totalNet = totalGross / (1 + pricing.vatRate / 100);
  if (mode === "net") return `${totalNet.toFixed(2)} zł netto`;
  if (mode === "both") return `${totalNet.toFixed(2)} / ${totalGross.toFixed(2)} zł`;
  return `${totalGross.toFixed(2)} zł`;
}

export function resolvedSaleNetForFilter(pricing: ResolvedProductPricing): number | null {
  return pricing.saleNet;
}
