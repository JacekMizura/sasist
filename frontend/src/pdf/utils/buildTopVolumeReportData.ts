import type { AssignedLocation, WarehouseProduct } from "../../types/warehouse";

export type TopVolumeDistributionType = "CONCENTRATED" | "MEDIUM" | "SCATTERED";

export type TopVolumeProductRow = {
  productId: string;
  name: string;
  totalQuantity: number;
  totalVolume: number;
  volumePerUnit: number;
  totalWeight: number;
  totalValue: number;
  valueDensity: number;
  locationCount: number;
  sharePercent: number;
  distributionType: TopVolumeDistributionType;
};

export type TopVolumeProblemRow = {
  productId: string;
  name: string;
  reason: string;
  problemTypes: ("Niska efektywność przestrzeni" | "Duża objętość" | "Rozproszenie")[];
  totalVolume: number;
  totalValue: number;
  valueDensity: number;
  locationCount: number;
};

export type TopVolumeReportData = {
  totalWarehouseVolume: number;
  top10Volume: number;
  top10SharePercent: number;
  totalProducts: number;
  totalWeightAll: number;
  avgVolumePerProduct: number;
  top1SharePercent: number;
  top3SharePercent: number;
  heaviestProductName: string;
  heaviestProductWeight: number;
  zeroValueProductsCount: number;
  highConcentration: boolean;
  topProducts: TopVolumeProductRow[];
  problematicProducts: TopVolumeProblemRow[];
};

export type BuildTopVolumeReportDataInput = {
  products: WarehouseProduct[];
};

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function qty(v: unknown): number {
  return Math.max(0, n(v));
}

function assigned(p: WarehouseProduct): AssignedLocation[] {
  return Array.isArray(p.assignedLocations) ? p.assignedLocations : [];
}

function distributionType(locationCount: number): TopVolumeDistributionType {
  if (locationCount <= 1) return "CONCENTRATED";
  if (locationCount <= 3) return "MEDIUM";
  return "SCATTERED";
}

export function buildTopVolumeReportData(input: BuildTopVolumeReportDataInput): TopVolumeReportData {
  const base = input.products
    .map((p) => {
      const locs = assigned(p);
      if (locs.length === 0) return null;
      const totalQuantity = locs.reduce((s, x) => s + qty(x.quantity), 0);
      const volumePerUnit = Math.max(0, n(p.volume_dm3));
      const unitWeight = Math.max(0, n((p as WarehouseProduct & { weight_kg?: number; weight?: number }).weight_kg ?? p.weight));
      const unitPrice = Math.max(0, n(p.purchase_price));
      const totalVolume = totalQuantity * volumePerUnit;
      const totalWeight = totalQuantity * unitWeight;
      const totalValue = totalQuantity * unitPrice;
      const valueDensity = totalVolume > 0 ? totalValue / totalVolume : 0;
      const locationCount = locs.length;
      return {
        productId: String(p.id),
        name: String(p.name ?? "").trim() || "Nieznany produkt",
        totalQuantity,
        totalVolume,
        volumePerUnit,
        totalWeight,
        totalValue,
        valueDensity,
        locationCount,
      };
    })
    .filter(
      (
        x
      ): x is {
        productId: string;
        name: string;
        totalQuantity: number;
        totalVolume: number;
        volumePerUnit: number;
        totalWeight: number;
        totalValue: number;
        valueDensity: number;
        locationCount: number;
      } => x != null
    );

  const totalWarehouseVolume = base.reduce((s, p) => s + p.totalVolume, 0);
  const totalWeightAll = base.reduce((s, p) => s + p.totalWeight, 0);
  const avgVolumePerProduct = base.length > 0 ? totalWarehouseVolume / base.length : 0;

  const sorted = [...base].sort((a, b) => b.totalVolume - a.totalVolume);
  const topProducts: TopVolumeProductRow[] = sorted.slice(0, 10).map((p) => ({
    ...p,
    sharePercent: totalWarehouseVolume > 0 ? (p.totalVolume / totalWarehouseVolume) * 100 : 0,
    distributionType: distributionType(p.locationCount),
  }));

  const top10Volume = topProducts.reduce((s, p) => s + p.totalVolume, 0);
  const top10SharePercent = totalWarehouseVolume > 0 ? (top10Volume / totalWarehouseVolume) * 100 : 0;
  const top1SharePercent = topProducts[0]?.sharePercent ?? 0;
  const top3Volume = topProducts.slice(0, 3).reduce((s, p) => s + p.totalVolume, 0);
  const top3SharePercent = totalWarehouseVolume > 0 ? (top3Volume / totalWarehouseVolume) * 100 : 0;
  const heaviest = [...base].sort((a, b) => b.totalWeight - a.totalWeight)[0] ?? null;
  const zeroValueProductsCount = base.filter((p) => p.totalValue <= 0).length;
  const highConcentration = top1SharePercent >= 35;

  const problematicProducts = [...base]
    .filter((p) => (p.totalVolume > 0 && p.valueDensity < 1) || p.locationCount > 3)
    .sort((a, b) => b.totalVolume - a.totalVolume || a.valueDensity - b.valueDensity)
    .slice(0, 3)
    .map((p) => {
      const problemTypes: ("Niska efektywność przestrzeni" | "Duża objętość" | "Rozproszenie")[] = [];
      if (p.valueDensity < 2) problemTypes.push("Niska efektywność przestrzeni");
      if (p.totalVolume >= avgVolumePerProduct) problemTypes.push("Duża objętość");
      if (p.locationCount > 3) problemTypes.push("Rozproszenie");
      return {
        productId: p.productId,
        name: p.name,
        reason: problemTypes[0] ?? "Niska efektywność przestrzeni",
        problemTypes,
        totalVolume: p.totalVolume,
        totalValue: p.totalValue,
        valueDensity: p.valueDensity,
        locationCount: p.locationCount,
      };
    });

  return {
    totalWarehouseVolume,
    top10Volume,
    top10SharePercent,
    totalProducts: base.length,
    totalWeightAll,
    avgVolumePerProduct,
    top1SharePercent,
    top3SharePercent,
    heaviestProductName: heaviest?.name ?? "—",
    heaviestProductWeight: heaviest?.totalWeight ?? 0,
    zeroValueProductsCount,
    highConcentration,
    topProducts,
    problematicProducts,
  };
}
