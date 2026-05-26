import type { BinState, LayoutState, WarehouseProduct } from "../../types/warehouse";
import { activeBinsForRack, getDisplayLocationLabel } from "../../components/warehouse/warehouseUtils";

type ProductLocationRow = {
  locationUuid: string;
  locationLabel: string;
  quantity: number;
  storageType: string;
};

type ProductDistributionRow = {
  productId: string;
  name: string;
  sku: string;
  locationCount: number;
  totalQuantity: number;
  locations: ProductLocationRow[];
  reserveLocationCount: number;
};

const DEFAULT_MAX_PRODUCTS = 50;

export type ProductLocationSummary = {
  totalProducts: number;
  averageLocationsPerProduct: number;
  mostDistributedProduct: {
    name: string;
    sku: string;
    locationCount: number;
  } | null;
  filterCounts: {
    multiLocationProducts: number;
    productsWithoutLocation: number;
    reserveStorageProducts: number;
  };
};

export type ProductLocationReportData = {
  warehouseName: string;
  exportDate: string;
  summary: ProductLocationSummary;
  productsSorted: ProductDistributionRow[];
};

type BinInfo = {
  label: string;
  storageType: string;
};

function normalizeUuid(v: string | null | undefined): string {
  const raw = (v ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "null") return "";
  return raw;
}

function normalizeStorageType(v: string | undefined): string {
  const raw = String(v ?? "PRIMARY").trim().toUpperCase();
  if (raw === "PRIMARY" || raw === "RESERVE" || raw === "DAMAGED" || raw === "STORE" || raw === "BUFFER") {
    return raw;
  }
  return "PRIMARY";
}

function binUuid(bin: BinState): string {
  return normalizeUuid((bin as { location_uuid?: string }).location_uuid ?? bin.locationUUID);
}

function buildBinInfoMap(layout: LayoutState): Map<string, BinInfo> {
  const map = new Map<string, BinInfo>();
  for (const rack of layout.racks ?? []) {
    for (const bin of activeBinsForRack(rack)) {
      const u = binUuid(bin);
      if (!u || map.has(u)) continue;
      map.set(u, {
        label: getDisplayLocationLabel(rack, bin, layout),
        storageType: normalizeStorageType(bin.storage_type),
      });
    }
  }
  return map;
}

function productsById(products: WarehouseProduct[]): Map<string, WarehouseProduct> {
  return new Map(products.map((p) => [String(p.id), p]));
}

function qty(q: unknown): number {
  return typeof q === "number" && Number.isFinite(q) ? Math.max(0, q) : 0;
}

function normalizeLocationKey(v: unknown): string {
  if (v == null) return "";
  const raw = String(v).trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "null") return "";
  return raw;
}

export type BuildProductLocationReportDataInput = {
  layout: LayoutState;
  products: WarehouseProduct[];
  maxProducts?: number;
};

export function buildProductLocationReportData(
  input: BuildProductLocationReportDataInput
): ProductLocationReportData {
  const { layout, products } = input;
  const maxProducts =
    typeof input.maxProducts === "number" && Number.isFinite(input.maxProducts) && input.maxProducts > 0
      ? Math.floor(input.maxProducts)
      : DEFAULT_MAX_PRODUCTS;
  const binInfo = buildBinInfoMap(layout);
  const productMap = productsById(products);

  const rows: ProductDistributionRow[] = products
    .map((p) => {
      const productId = String(p.id);
      const assigned = Array.isArray(p.assignedLocations) ? p.assignedLocations : [];
      if (assigned.length === 0) return null;

      const byLocation = new Map<string, ProductLocationRow>();
      let totalQuantity = 0;
      for (const a of assigned) {
        const locationUuid = normalizeLocationKey(a.locationUUID);
        if (!locationUuid) continue;
        const quantity = qty(a.quantity);
        totalQuantity += quantity;
        const info = binInfo.get(locationUuid);
        const prev = byLocation.get(locationUuid);
        if (prev) {
          prev.quantity += quantity;
          continue;
        }
        byLocation.set(locationUuid, {
          locationUuid,
          locationLabel: info?.label || a.locationAddress || "Nieprzypisana lokalizacja",
          quantity,
          storageType: normalizeStorageType(a.storageType ?? info?.storageType),
        });
      }
      const locations = [...byLocation.values()].sort((a, b) =>
        a.locationLabel.localeCompare(b.locationLabel, "pl")
      );
      const locationCount = assigned.filter((a) => normalizeLocationKey(a.locationUUID).length > 0).length;
      const reserveLocationCount = locations.filter((l) => l.storageType === "RESERVE").length;
      return {
        productId,
        name: String(p.name ?? productMap.get(productId)?.name ?? "Nieznany produkt"),
        sku: String(p.sku ?? productMap.get(productId)?.sku ?? "—"),
        locationCount,
        totalQuantity,
        locations,
        reserveLocationCount,
      } satisfies ProductDistributionRow;
    })
    .filter((r): r is ProductDistributionRow => r != null);

  console.log("[ProductLocationReport] assigned-locations grouping", {
    productsInputLength: products.length,
    groupedProductsLength: rows.length,
  });

  rows.sort((a, b) => b.locationCount - a.locationCount || b.totalQuantity - a.totalQuantity);

  const rowsLimited = rows.slice(0, maxProducts);

  const totalProducts = rows.length;
  const averageLocationsPerProduct =
    totalProducts > 0 ? rows.reduce((s, x) => s + x.locationCount, 0) / totalProducts : 0;
  const mostDistributedProduct = rows[0]
    ? {
        name: rows[0].name,
        sku: rows[0].sku,
        locationCount: rows[0].locationCount,
      }
    : null;
  const multiLocationProducts = rows.filter((x) => x.locationCount > 1).length;
  const productsWithoutLocation = 0;
  const reserveStorageProducts = rows.filter((x) => x.reserveLocationCount > 0).length;
  return {
    warehouseName: String(layout.warehouse_name ?? layout.name ?? "Magazyn").trim() || "Magazyn",
    exportDate: new Date().toLocaleString("pl-PL"),
    summary: {
      totalProducts,
      averageLocationsPerProduct,
      mostDistributedProduct,
      filterCounts: {
        multiLocationProducts,
        productsWithoutLocation,
        reserveStorageProducts,
      },
    },
    productsSorted: rowsLimited,
  };
}
