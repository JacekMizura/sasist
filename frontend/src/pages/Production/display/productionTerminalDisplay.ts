/**
 * SSOT helpers for WMS Produkcja → Wygląd terminala (`terminal_display`).
 * Pure presentation — never gates routing, scan validation, or lifecycle.
 */
import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import { formatProductionQuantity } from "../productionUi";

export type WmsProductionProductIdentityInput = {
  name?: string | null;
  sku?: string | null;
  ean?: string | null;
  catalogNumber?: string | null;
  /** Distinct Product.barcode (Code128 scan id) — not EAN. */
  barcode?: string | null;
  imageUrl?: string | null;
  unit?: string | null;
};

export type WmsProductionProductIdentityResolved = {
  showImage: boolean;
  imageUrl: string | null;
  showName: boolean;
  name: string | null;
  /** Compact identity line (SKU · EAN · …) — null when empty. */
  metaLine: string | null;
  unitLabel: string;
};

function trimOrNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

export function resolveProductUnit(unit: string | null | undefined): string {
  return trimOrNull(unit) ?? "szt.";
}

/** Format qty with optional unit suffix from display.show_unit. */
export function formatTerminalQuantity(
  n: number | null | undefined,
  opts: { unit?: string | null; showUnit: boolean },
): string {
  const qty = formatProductionQuantity(n);
  if (!opts.showUnit) return qty;
  return `${qty} ${resolveProductUnit(opts.unit)}`;
}

/**
 * Build compact identity bits from display flags.
 * Skips empty values — never emits "EAN: —".
 */
export function buildProductIdentityBits(
  display: ProductionTerminalDisplaySettings,
  product: WmsProductionProductIdentityInput,
): string[] {
  const bits: string[] = [];
  const sku = trimOrNull(product.sku);
  const ean = trimOrNull(product.ean);
  const catalog = trimOrNull(product.catalogNumber);
  const barcode = trimOrNull(product.barcode);

  if (display.show_sku && sku) bits.push(sku);
  if (display.show_ean && ean) bits.push(`EAN ${ean}`);
  if (display.show_catalog_number && catalog) bits.push(catalog);
  if (display.show_barcode && barcode) bits.push(barcode);
  return bits;
}

export function buildProductIdentityMetaLine(
  display: ProductionTerminalDisplaySettings,
  product: WmsProductionProductIdentityInput,
): string | null {
  const bits = buildProductIdentityBits(display, product);
  return bits.length > 0 ? bits.join(" · ") : null;
}

export function resolveWmsProductionProductIdentity(
  display: ProductionTerminalDisplaySettings,
  product: WmsProductionProductIdentityInput,
): WmsProductionProductIdentityResolved {
  const name = trimOrNull(product.name);
  const imageUrl = trimOrNull(product.imageUrl);
  return {
    showImage: Boolean(display.show_product_image),
    imageUrl: display.show_product_image ? imageUrl : null,
    showName: Boolean(display.show_name) && name != null,
    name: display.show_name ? name : null,
    metaLine: buildProductIdentityMetaLine(display, product),
    unitLabel: resolveProductUnit(product.unit),
  };
}

/** Source location presentation only — does not affect pick options / validation. */
export function shouldShowSourceLocation(display: ProductionTerminalDisplaySettings): boolean {
  return Boolean(display.show_source_location);
}

export function shouldShowStockLevel(display: ProductionTerminalDisplaySettings): boolean {
  return Boolean(display.show_stock_level);
}
