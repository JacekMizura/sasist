/**
 * Shared pricing display for products and bundles.
 * Products: purchase cost from product; bundles: materials from components.
 */

import {
  formatMoneyZlDisplay,
  resolveProductPricingDisplay,
  type ProductPricingDisplay,
} from "./resolvedProductPricing";

export type PriceEntryMode = "net" | "gross";

export type PriceHistoryEntry = {
  at: string;
  sale_net: number | null;
  sale_gross: number | null;
  note?: string | null;
};

export type BundleComponentCostLine = {
  productId: number;
  quantity: number;
  purchasePrice: number | null;
};

export type BundlePricingDisplay = {
  materialsCost: number | null;
  packagingCost: number;
  productionCost: number;
  totalCost: number | null;
  purchaseCost: number | null;
  saleNet: number | null;
  saleGross: number | null;
  marginValue: number | null;
  marginPercent: number | null;
  marginLabel: string;
  vatRate: number;
  vatLabel: string;
  missingComponentCosts: number;
  componentLines: BundleComponentCostLine[];
};

/** Default tenant minimum margin when no setting exists (matches amber threshold). */
export const DEFAULT_MIN_MARGIN_PERCENT = 10;

function finiteNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function grossFromNet(net: number | null, vatPercent: number): number | null {
  if (net == null) return null;
  return Math.round(net * (1 + vatPercent / 100) * 100) / 100;
}

function netFromGross(gross: number | null, vatPercent: number): number | null {
  if (gross == null) return null;
  const denom = 1 + vatPercent / 100;
  if (denom <= 1e-9) return null;
  return Math.round((gross / denom) * 100) / 100;
}

export function parseVatRateFromMetadata(
  metadataJson: string | null | undefined,
  uiKey: "product_ui" | "bundle_ui" = "product_ui",
): string {
  if (!metadataJson?.trim()) return "";
  try {
    const obj = JSON.parse(metadataJson) as Record<string, unknown>;
    const ui = obj[uiKey];
    if (ui && typeof ui === "object" && !Array.isArray(ui)) {
      const v = (ui as Record<string, unknown>).vat_rate;
      if (v != null && String(v).trim() !== "") return String(v);
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function parsePriceHistory(metadataJson: string | null | undefined): PriceHistoryEntry[] {
  if (!metadataJson?.trim()) return [];
  try {
    const obj = JSON.parse(metadataJson) as Record<string, unknown>;
    const raw = obj.price_history;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const at = String(r.at ?? "").trim();
        if (!at) return null;
        return {
          at,
          sale_net: finiteNum(r.sale_net),
          sale_gross: finiteNum(r.sale_gross),
          note: r.note != null ? String(r.note) : null,
        } satisfies PriceHistoryEntry;
      })
      .filter((x): x is PriceHistoryEntry => x != null);
  } catch {
    return [];
  }
}

export function appendPriceHistoryEntry(
  existing: string | null | undefined,
  entry: PriceHistoryEntry,
  uiKey: "product_ui" | "bundle_ui" = "bundle_ui",
  vatRate?: string,
): string {
  let root: Record<string, unknown> = {};
  if (existing?.trim()) {
    try {
      const parsed = JSON.parse(existing) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        root = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      root = {};
    }
  }
  const prev = parsePriceHistory(existing);
  root.price_history = [...prev, entry].slice(-50);
  if (vatRate != null && vatRate.trim() !== "") {
    const ui = root[uiKey];
    const uiObj =
      ui && typeof ui === "object" && !Array.isArray(ui) ? { ...(ui as Record<string, unknown>) } : {};
    uiObj.vat_rate = vatRate.trim();
    root[uiKey] = uiObj;
  }
  return JSON.stringify(root);
}

export function resolveBundlePricingDisplay(args: {
  rows: { productId: number | null; quantity: number }[];
  purchaseByProductId: Record<number, number | null | undefined>;
  salePrice?: number | "" | null;
  salePriceEntryMode?: PriceEntryMode;
  vatRate?: string;
  packagingCostNet?: number | "" | null;
  productionCostNet?: number | "" | null;
  fulfillmentMode?: "assembly" | "manufacturing";
}): BundlePricingDisplay {
  const { percent: vatPercent, fromDefault } = (() => {
    const raw = (args.vatRate ?? "").trim().replace(",", ".");
    if (raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return { percent: n, fromDefault: false };
    }
    return { percent: 23, fromDefault: true };
  })();
  const vatLabel = fromDefault ? `${vatPercent}% (domyślny)` : `${vatPercent}%`;

  const componentLines: BundleComponentCostLine[] = [];
  let materialsSum = 0;
  let hasComponent = false;
  let missingComponentCosts = 0;

  for (const r of args.rows) {
    if (r.productId == null || r.quantity < 1) continue;
    hasComponent = true;
    const qty = Math.max(1, Math.floor(r.quantity));
    const purchasePrice = finiteNum(args.purchaseByProductId[r.productId]);
    componentLines.push({ productId: r.productId, quantity: qty, purchasePrice });
    if (purchasePrice == null) {
      missingComponentCosts += 1;
    } else {
      materialsSum += qty * purchasePrice;
    }
  }

  const materialsCost = hasComponent ? Math.round(materialsSum * 100) / 100 : null;
  const packagingCost = finiteNum(args.packagingCostNet) ?? 0;
  const productionRaw = finiteNum(args.productionCostNet) ?? 0;
  const productionCost = args.fulfillmentMode === "manufacturing" ? productionRaw : 0;
  const totalCost =
    materialsCost != null ? Math.round((materialsCost + packagingCost + productionCost) * 100) / 100 : null;

  const entryMode = args.salePriceEntryMode ?? "net";
  const rawSale = finiteNum(args.salePrice);
  let saleNet = rawSale;
  let saleGross = grossFromNet(rawSale, vatPercent);
  if (entryMode === "gross" && rawSale != null) {
    saleGross = rawSale;
    saleNet = netFromGross(rawSale, vatPercent);
  }

  let marginValue: number | null = null;
  let marginPercent: number | null = null;
  if (saleNet != null && totalCost != null) {
    marginValue = Math.round((saleNet - totalCost) * 100) / 100;
    if (saleNet > 1e-9) {
      marginPercent = Math.round((marginValue / saleNet) * 10000) / 100;
    }
  }

  let marginLabel = "—";
  if (marginPercent != null) {
    marginLabel = `${marginPercent.toFixed(2)}%`;
  } else if (saleNet == null) {
    marginLabel = "brak ceny sprzedaży";
  } else if (totalCost == null) {
    marginLabel = "brak danych kosztu";
  }

  return {
    materialsCost,
    packagingCost,
    productionCost,
    totalCost,
    purchaseCost: materialsCost,
    saleNet,
    saleGross,
    marginValue,
    marginPercent,
    marginLabel,
    vatRate: vatPercent,
    vatLabel,
    missingComponentCosts,
    componentLines,
  };
}

/** Product pricing via central resolver (re-export shape for shared UI). */
export function resolveProductEntityPricing(args: {
  currentCost?: Parameters<typeof resolveProductPricingDisplay>[0]["currentCost"];
  salePrice?: number | "" | null;
  purchasePrice?: number | "" | null;
  metadataVatRate?: string;
  extraCostPackagingNet?: number | "" | null;
  extraCostCommissionPercent?: number | "" | null;
  extraCostOtherNet?: number | "" | null;
}): ProductPricingDisplay {
  return resolveProductPricingDisplay(args);
}

export function entityMarginToneClass(marginPercent: number | null | undefined): string {
  if (marginPercent == null || Number.isNaN(Number(marginPercent))) return "text-slate-700";
  if (Number(marginPercent) > 30) return "text-emerald-600 font-semibold";
  if (Number(marginPercent) >= DEFAULT_MIN_MARGIN_PERCENT) return "text-amber-600 font-semibold";
  return "text-rose-600 font-semibold";
}

export type PricingAlert = { tone: "error" | "warning"; message: string };

export function buildPricingAlerts(args: {
  saleNet: number | null;
  totalCost: number | null;
  marginPercent: number | null;
  minMarginPercent?: number;
}): PricingAlert[] {
  const alerts: PricingAlert[] = [];
  const minMargin = args.minMarginPercent ?? DEFAULT_MIN_MARGIN_PERCENT;
  if (args.saleNet != null && args.totalCost != null && args.saleNet < args.totalCost) {
    alerts.push({ tone: "error", message: "Sprzedaż poniżej kosztu zakupu." });
  }
  if (
    args.marginPercent != null &&
    args.saleNet != null &&
    args.totalCost != null &&
    args.saleNet >= args.totalCost &&
    args.marginPercent < minMargin
  ) {
    alerts.push({
      tone: "warning",
      message: `Marża poniżej minimalnej (${minMargin.toFixed(0)}%).`,
    });
  }
  return alerts;
}

export { formatMoneyZlDisplay };

export function formatPriceHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

export function salePriceInputValue(
  salePrice: number | "",
  entryMode: PriceEntryMode,
  vatRate: number,
): number | "" {
  if (salePrice === "") return "";
  const n = typeof salePrice === "number" ? salePrice : Number(salePrice);
  if (!Number.isFinite(n)) return "";
  if (entryMode === "gross") {
    return grossFromNet(n, vatRate) ?? n;
  }
  return n;
}

export function salePriceFromInput(
  raw: number | "",
  entryMode: PriceEntryMode,
  vatRate: number,
): number | "" {
  if (raw === "") return "";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return "";
  if (entryMode === "gross") {
    return netFromGross(n, vatRate) ?? n;
  }
  return n;
}
