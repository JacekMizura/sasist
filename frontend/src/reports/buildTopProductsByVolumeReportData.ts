import type { AssignedLocation, WarehouseProduct } from "../types/warehouse";

export type TopProductsByVolumeRow = {
  productId: string;
  name: string;
  totalQuantity: number;
  totalVolumeDm3: number;
  volumePerUnitDm3: number;
  totalWeightKg: number;
  totalValuePln: number;
  locationCount: number;
  sharePercent: number;
  totalVolumeLabel: string;
  volumePerUnitLabel: string;
  totalWeightLabel: string;
  totalValueLabel: string;
  sharePercentLabel: string;
};

export type TopProductsByVolumeReportData = {
  totalWarehouseVolumeDm3: number;
  top10VolumeDm3: number;
  top10SharePercent: number;
  totalProducts: number;
  totalWarehouseVolumeLabel: string;
  top10VolumeLabel: string;
  top10SharePercentLabel: string;
  products: TopProductsByVolumeRow[];
};

export type BuildTopProductsByVolumeReportDataInput = {
  products: WarehouseProduct[];
};

function safeNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function safeQty(v: unknown): number {
  return Math.max(0, safeNumber(v));
}

function safeVolumeDm3(v: unknown): number {
  return Math.max(0, safeNumber(v));
}

function safeWeightKg(v: unknown): number {
  const direct = safeNumber(v);
  if (direct > 0) return direct;
  return 0;
}

function safePricePln(v: unknown): number {
  return Math.max(0, safeNumber(v));
}

function assignedForProduct(p: WarehouseProduct): AssignedLocation[] {
  return Array.isArray(p.assignedLocations) ? p.assignedLocations : [];
}

function formatDm3(v: number): string {
  const rounded = Math.round(v);
  return `${rounded.toLocaleString("pl-PL")} dm³`;
}

function formatKg(v: number): string {
  const rounded = Number(v.toFixed(2));
  return `${rounded.toLocaleString("pl-PL")} kg`;
}

function formatPln(v: number): string {
  const rounded = Math.round(v);
  return `${rounded.toLocaleString("pl-PL")} zł`;
}

function formatPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

export function buildTopProductsByVolumeReportData(
  input: BuildTopProductsByVolumeReportDataInput
): TopProductsByVolumeReportData {
  const rowsBase = input.products
    .map((p) => {
      const assigned = assignedForProduct(p);
      if (assigned.length === 0) return null;

      const totalQuantity = assigned.reduce((sum, a) => sum + safeQty(a.quantity), 0);
      const volumePerUnitDm3 = safeVolumeDm3(p.volume_dm3);
      const unitWeightKg = safeWeightKg((p as WarehouseProduct & { weight_kg?: number; weight?: number }).weight_kg ?? p.weight);
      const unitPricePln = safePricePln(p.purchase_price);
      const totalVolumeDm3 = totalQuantity * volumePerUnitDm3;
      const totalWeightKg = totalQuantity * unitWeightKg;
      const totalValuePln = totalQuantity * unitPricePln;

      return {
        productId: String(p.id),
        name: String(p.name ?? "").trim() || "Nieznany produkt",
        totalQuantity,
        totalVolumeDm3,
        volumePerUnitDm3,
        totalWeightKg,
        totalValuePln,
        locationCount: assigned.length,
      };
    })
    .filter(
      (
        row
      ): row is {
        productId: string;
        name: string;
        totalQuantity: number;
        totalVolumeDm3: number;
        volumePerUnitDm3: number;
        totalWeightKg: number;
        totalValuePln: number;
        locationCount: number;
      } => row != null
    );

  const totalWarehouseVolumeDm3 = rowsBase.reduce((sum, r) => sum + r.totalVolumeDm3, 0);
  const sorted = [...rowsBase].sort((a, b) => b.totalVolumeDm3 - a.totalVolumeDm3);
  const top10Base = sorted.slice(0, 10);
  const top10VolumeDm3 = top10Base.reduce((sum, r) => sum + r.totalVolumeDm3, 0);
  const top10SharePercent =
    totalWarehouseVolumeDm3 > 0 ? (top10VolumeDm3 / totalWarehouseVolumeDm3) * 100 : 0;

  const products: TopProductsByVolumeRow[] = top10Base.map((r) => {
    const sharePercent =
      totalWarehouseVolumeDm3 > 0 ? (r.totalVolumeDm3 / totalWarehouseVolumeDm3) * 100 : 0;
    return {
      ...r,
      sharePercent,
      totalVolumeLabel: formatDm3(r.totalVolumeDm3),
      volumePerUnitLabel: formatDm3(r.volumePerUnitDm3),
      totalWeightLabel: formatKg(r.totalWeightKg),
      totalValueLabel: formatPln(r.totalValuePln),
      sharePercentLabel: formatPct(sharePercent),
    };
  });

  return {
    totalWarehouseVolumeDm3,
    top10VolumeDm3,
    top10SharePercent,
    totalProducts: rowsBase.length,
    totalWarehouseVolumeLabel: formatDm3(totalWarehouseVolumeDm3),
    top10VolumeLabel: formatDm3(top10VolumeDm3),
    top10SharePercentLabel: formatPct(top10SharePercent),
    products,
  };
}
