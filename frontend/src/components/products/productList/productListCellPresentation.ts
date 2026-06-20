import type { ProductListRow } from "../../../types/productListRow";
import {
  formatResolvedSalePrice,
  resolveProductPricingFromRow,
} from "../../../utils/resolvedProductPricing";

type Product = ProductListRow;

export function formatProductListPrice(p: Product): string {
  const pricing = resolveProductPricingFromRow(p);
  return formatResolvedSalePrice(pricing, "both", "");
}

export function formatProductPurchasePrice(p: Product): string {
  const pricing = resolveProductPricingFromRow(p);
  if (pricing.purchaseNet == null) return "—";
  return `${pricing.purchaseNet.toFixed(2)} zł netto`;
}

export function formatProductDimensionsCm(p: Product): string {
  const dims: number[] = [];
  if (p.length != null && Number.isFinite(Number(p.length))) dims.push(Number(p.length));
  if (p.width != null && Number.isFinite(Number(p.width))) dims.push(Number(p.width));
  if (p.height != null && Number.isFinite(Number(p.height))) dims.push(Number(p.height));
  const cleaned = dims.filter((x) => x > 0);
  if (cleaned.length === 0) return "—";
  const out = cleaned
    .map((x) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : String(x)))
    .join(" × ");
  return `${out} cm`;
}

export function formatProductInventoryValue(p: Product): string {
  const stock = p.stock_quantity ?? 0;
  if (stock === 0) return "0 zł";
  const iv = p.inventory_value;
  if (iv == null || !Number.isFinite(iv)) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(iv);
}

export function formatProductMargin(p: Product): string {
  const pct = p.current_cost?.margin_percent;
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${pct.toFixed(1).replace(".", ",")}%`;
}

export function formatProductLastPurchase(p: Product): string {
  const date = p.last_purchase_date?.trim();
  const supplier = p.last_supplier_brief?.name?.trim();
  if (!date && !supplier) return "—";
  if (date && supplier) return `${date} · ${supplier}`;
  return date ?? supplier ?? "—";
}

export function formatProductLastSale(p: Product): string {
  const qty = p.rotation_30d;
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return "—";
  return `${qty} szt. / 30 dni`;
}

export function isProductDataComplete(p: Product): boolean {
  return Boolean(p.length && p.width && p.height);
}

export function hasPlanVersusPhysicalMismatch(p: Product): boolean {
  const assigned = p.assignedLocations ?? [];
  if (assigned.length === 0) return false;
  const planSum = assigned.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
  const physical = p.stock_quantity ?? 0;
  return Math.abs(planSum - physical) > 0.01;
}

export function formatPlDateShort(raw: string | null | undefined): string {
  const t = raw?.trim();
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString("pl-PL");
}
