import type { AssignedLocation, NormalizedStorageType, WarehouseProduct } from "../types/warehouse";
import { normalizeStorageType } from "../utils/storageTypes";

type ValueByStorageType = {
  primary: number;
  reserve: number;
  damaged: number;
};

type ValueByStorageTypeFormatted = {
  primary: string;
  reserve: string;
  damaged: string;
};

export type WarehouseValueTopProduct = {
  productId: string;
  name: string;
  sku: string;
  totalQuantity: number;
  purchasePricePln: number;
  productValuePln: number;
  productValueLabel: string;
  locationsCount: number;
};

export type WarehouseValueReportData = {
  totalWarehouseValue: number;
  totalWarehouseValueLabel: string;
  totalProducts: number;
  avgValuePerProduct: number;
  avgValuePerProductLabel: string;
  totalLocations: number;
  valueByStorageType: ValueByStorageType;
  valueByStorageTypeLabel: ValueByStorageTypeFormatted;
  topProducts: WarehouseValueTopProduct[];
};

export type BuildWarehouseValueReportDataInput = {
  products: WarehouseProduct[];
};

function safeNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function safePrice(v: unknown): number {
  return Math.max(0, safeNumber(v));
}

function safeQty(v: unknown): number {
  return Math.max(0, safeNumber(v));
}

/** 3-bucket report: pick/buffer/unknown roll into primary. */
function bucketForValueReport(st: NormalizedStorageType): "primary" | "reserve" | "damaged" {
  if (st === "reserve") return "reserve";
  if (st === "damaged") return "damaged";
  return "primary";
}

function formatPln(value: number): string {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString("pl-PL")} zł`;
}

function assignedForProduct(p: WarehouseProduct): AssignedLocation[] {
  return Array.isArray(p.assignedLocations) ? p.assignedLocations : [];
}

export function buildWarehouseValueReportData(
  input: BuildWarehouseValueReportDataInput
): WarehouseValueReportData {
  const productsWithAssignments = input.products.filter((p) => assignedForProduct(p).length > 0);
  const uniqueLocationUuids = new Set<string>();
  const byType: ValueByStorageType = { primary: 0, reserve: 0, damaged: 0 };
  const topRows: WarehouseValueTopProduct[] = [];

  let totalWarehouseValue = 0;
  for (const p of productsWithAssignments) {
    const productId = String(p.id);
    const name = String(p.name ?? "").trim() || "Nieznany produkt";
    const sku = String(p.sku ?? "").trim() || "—";
    const purchasePricePln = safePrice(p.purchase_price);
    const assigned = assignedForProduct(p);

    let totalQuantity = 0;
    for (const a of assigned) {
      const q = safeQty(a.quantity);
      totalQuantity += q;
      const uuid = String(a.locationUUID ?? "").trim();
      if (uuid) uniqueLocationUuids.add(uuid);
      const st = bucketForValueReport(normalizeStorageType(a.storageType));
      byType[st] += q * purchasePricePln;
    }

    const productValuePln = totalQuantity * purchasePricePln;
    totalWarehouseValue += productValuePln;
    topRows.push({
      productId,
      name,
      sku,
      totalQuantity,
      purchasePricePln,
      productValuePln,
      productValueLabel: formatPln(productValuePln),
      locationsCount: assigned.length,
    });
  }

  topRows.sort((a, b) => b.productValuePln - a.productValuePln);
  const topProducts = topRows.slice(0, 10);
  const totalProducts = productsWithAssignments.length;
  const avgValuePerProduct = totalProducts > 0 ? totalWarehouseValue / totalProducts : 0;

  return {
    totalWarehouseValue,
    totalWarehouseValueLabel: formatPln(totalWarehouseValue),
    totalProducts,
    avgValuePerProduct,
    avgValuePerProductLabel: formatPln(avgValuePerProduct),
    totalLocations: uniqueLocationUuids.size,
    valueByStorageType: byType,
    valueByStorageTypeLabel: {
      primary: formatPln(byType.primary),
      reserve: formatPln(byType.reserve),
      damaged: formatPln(byType.damaged),
    },
    topProducts,
  };
}
