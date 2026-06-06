/** Resolved pricing labels for product edit — never show bare "—" without context. */

const DEFAULT_VAT_PERCENT = 23;

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

export type ProductPricingDisplay = {
  saleNet: number | null;
  saleGross: number | null;
  purchaseNet: number | null;
  purchaseGross: number | null;
  landedCostNet: number | null;
  vatPercent: number;
  vatLabel: string;
  marginValue: number | null;
  marginPercent: number | null;
  marginLabel: string;
  hasCostData: boolean;
};

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
    landedCostNet,
    vatPercent,
    vatLabel,
    marginValue,
    marginPercent,
    marginLabel,
    hasCostData,
  };
}

export function formatMoneyZlDisplay(v: number | null | undefined, emptyLabel = "brak danych"): string {
  if (v == null || Number.isNaN(Number(v))) return emptyLabel;
  return `${Number(v).toFixed(2)} zł`;
}
