import type { LayoutState, WarehouseProduct } from "../../types/warehouse";
import type { InventoryRow } from "../../pages/WarehouseDesigner/inventoryMaps";
import {
  computeWarehouseMetrics,
  binsByLocationUuid,
  type MetricsProductInput,
} from "../../metrics";
import { normalizeStorageType } from "../../utils/storageTypes";
import { formatWarehouseLocationTypeLabel } from "../../utils/warehouseLocationTypeLabels";

type ProductValueRow = {
  productId: string;
  name: string;
  valuePln: number;
  sharePct: number;
};

type QuantityMismatchRow = {
  productId: string;
  name: string;
  expectedQuantity: number;
  actualQuantity: number;
  difference: number;
};

type StorageUsageRow = {
  key: "primary" | "reserve" | "damaged" | "pick" | "buffer" | "unknown";
  label: string;
  usedDm3: number;
  capacityDm3: number;
  utilizationPct: number;
};

export type ExecutiveIssue = {
  title: string;
  impact: string;
  recommendation: string;
};

export type WarehouseExecutiveReportData = {
  warehouseName: string;
  exportDate: string;
  totalInventoryValuePln: number;
  occupancyPct: number;
  freeSpacePct: number;
  productCount: number;
  insights: string[];
  topProductsByValue: ProductValueRow[];
  top5SharePct: number;
  storageUsage: StorageUsageRow[];
  occupancyBreakdown: {
    usedDm3: number;
    freeDm3: number;
    totalDm3: number;
  };
  quantityReconciliation: {
    productsCompared: number;
    mismatchCount: number;
    mismatchSharePct: number;
    expectedQuantityTotal: number;
    actualQuantityTotal: number;
    differenceTotal: number;
    topMismatches: QuantityMismatchRow[];
  };
  issues: ExecutiveIssue[];
};

const STORAGE_LABEL: Record<StorageUsageRow["key"], string> = {
  primary: formatWarehouseLocationTypeLabel("primary"),
  reserve: formatWarehouseLocationTypeLabel("reserve"),
  damaged: formatWarehouseLocationTypeLabel("damaged"),
  pick: formatWarehouseLocationTypeLabel("pick"),
  buffer: formatWarehouseLocationTypeLabel("buffer"),
  unknown: "Nieznany typ",
};

function safeQty(q: unknown): number {
  return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : 0;
}

function productNameById(products: WarehouseProduct[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of products) {
    map.set(String(p.id), String(p.name ?? "").trim() || `Produkt ${String(p.id)}`);
  }
  return map;
}

function productPriceById(products: WarehouseProduct[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of products) {
    const price =
      typeof p.purchase_price === "number" && Number.isFinite(p.purchase_price) ? p.purchase_price : 0;
    map.set(String(p.id), price);
  }
  return map;
}

function allProductValues(
  inventoryRows: InventoryRow[],
  layoutUuidSet: Set<string>,
  nameById: Map<string, string>,
  priceById: Map<string, number>
): Array<{ productId: string; name: string; valuePln: number }> {
  const valueByProduct = new Map<string, number>();
  for (const row of inventoryRows) {
    const u = (row.location_uuid ?? "").trim();
    if (!u || !layoutUuidSet.has(u)) continue;
    const qty = safeQty(row.quantity);
    if (qty <= 0) continue;
    const pid = String(row.product_id);
    const price = priceById.get(pid) ?? 0;
    if (price <= 0) continue;
    valueByProduct.set(pid, (valueByProduct.get(pid) ?? 0) + qty * price);
  }
  return [...valueByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([productId, valuePln]) => ({
      productId,
      name: nameById.get(productId) ?? `Produkt ${productId}`,
      valuePln,
    }));
}

function activeProductCount(inventoryRows: InventoryRow[], layoutUuidSet: Set<string>): number {
  const ids = new Set<string>();
  for (const row of inventoryRows) {
    const u = (row.location_uuid ?? "").trim();
    if (!u || !layoutUuidSet.has(u)) continue;
    if (safeQty(row.quantity) <= 0) continue;
    ids.add(String(row.product_id));
  }
  return ids.size;
}

function quantityReconciliation(input: {
  products: WarehouseProduct[];
  inventoryRows: InventoryRow[];
  layoutUuidSet: Set<string>;
  nameById: Map<string, string>;
}) {
  const actualByProduct = new Map<string, number>();
  for (const row of input.inventoryRows) {
    const u = (row.location_uuid ?? "").trim();
    if (!u || !input.layoutUuidSet.has(u)) continue;
    const qty = safeQty(row.quantity);
    if (qty <= 0) continue;
    const pid = String(row.product_id);
    actualByProduct.set(pid, (actualByProduct.get(pid) ?? 0) + qty);
  }

  let expectedQuantityTotal = 0;
  let actualQuantityTotal = 0;
  let productsCompared = 0;
  const mismatches: QuantityMismatchRow[] = [];

  for (const p of input.products) {
    const expectedRaw = (p as WarehouseProduct & { quantity?: number }).quantity;
    const expected = typeof expectedRaw === "number" && Number.isFinite(expectedRaw) ? Math.max(0, expectedRaw) : null;
    if (expected == null) continue;
    const pid = String(p.id);
    const actual = actualByProduct.get(pid) ?? 0;
    productsCompared += 1;
    expectedQuantityTotal += expected;
    actualQuantityTotal += actual;
    const difference = actual - expected;
    if (Math.abs(difference) > 0.0001) {
      mismatches.push({
        productId: pid,
        name: input.nameById.get(pid) ?? `Produkt ${pid}`,
        expectedQuantity: expected,
        actualQuantity: actual,
        difference,
      });
    }
  }

  mismatches.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  const mismatchCount = mismatches.length;
  const mismatchSharePct = productsCompared > 0 ? (mismatchCount / productsCompared) * 100 : 0;

  return {
    productsCompared,
    mismatchCount,
    mismatchSharePct,
    expectedQuantityTotal,
    actualQuantityTotal,
    differenceTotal: actualQuantityTotal - expectedQuantityTotal,
    topMismatches: mismatches.slice(0, 5),
  };
}

function usedVolumeByStorageType(
  layout: LayoutState,
  inventoryRows: InventoryRow[],
  products: WarehouseProduct[]
): Record<StorageUsageRow["key"], number> {
  const volByProduct = new Map<string, number>();
  for (const p of products) {
    const v = typeof p.volume_dm3 === "number" && Number.isFinite(p.volume_dm3) ? p.volume_dm3 : 0;
    volByProduct.set(String(p.id), Math.max(0, v));
  }
  const binsByUuid = binsByLocationUuid(layout);
  const out: Record<StorageUsageRow["key"], number> = {
    primary: 0,
    reserve: 0,
    damaged: 0,
    pick: 0,
    buffer: 0,
    unknown: 0,
  };
  for (const row of inventoryRows) {
    const u = (row.location_uuid ?? "").trim();
    if (!u) continue;
    const br = binsByUuid.get(u);
    if (!br) continue;
    const qty = safeQty(row.quantity);
    if (qty <= 0) continue;
    const unit = volByProduct.get(String(row.product_id)) ?? 0;
    if (unit <= 0) continue;
    const key = normalizeStorageType(br.bin.storage_type) as StorageUsageRow["key"];
    if (key in out) out[key] += qty * unit;
  }
  return out;
}

function buildInsights(input: {
  occupancyPct: number;
  freeSpacePct: number;
  top5SharePct: number;
  dominantStorageLabel: string;
  dominantStorageUtilPct: number;
  mismatchSharePct: number;
}): string[] {
  const occupancyTone =
    input.occupancyPct >= 80
      ? "Magazyn pracuje przy wysokim poziomie wykorzystania pojemności."
      : input.occupancyPct >= 55
        ? "Wykorzystanie pojemności jest stabilne i daje przestrzeń na dalszy wzrost."
        : "Wykorzystanie pojemności jest niskie i wskazuje na rezerwę operacyjną.";
  const valueTone =
    input.top5SharePct >= 65
      ? "Wartość zapasu jest silnie skoncentrowana w kilku kluczowych produktach."
      : "Wartość zapasu jest relatywnie rozproszona między produktami.";
  const storageTone = `Najbardziej obciążony segment to lokalizacje ${input.dominantStorageLabel.toLowerCase()} (${input.dominantStorageUtilPct.toFixed(1)}% wykorzystania).`;
  const freeTone =
    input.freeSpacePct >= 40
      ? "Dostępna wolna przestrzeń umożliwia bezpieczne zwiększenie zapasu."
      : "Wolna przestrzeń jest ograniczona, dlatego warto planować rotację i uzupełnienia.";
  const reconciliationTone =
    input.mismatchSharePct > 20
      ? "Widoczna jest istotna rozbieżność między stanem oczekiwanym a fizycznym."
      : "Spójność stanu oczekiwanego i fizycznego pozostaje na stabilnym poziomie.";
  return [occupancyTone, valueTone, storageTone, freeTone, reconciliationTone].slice(0, 3);
}

function buildIssues(input: {
  occupancyPct: number;
  freeSpacePct: number;
  reserveUsedSharePct: number;
  top5SharePct: number;
  storageUtilSpreadPct: number;
  mismatchSharePct: number;
}): ExecutiveIssue[] {
  const issues: ExecutiveIssue[] = [];
  if (input.occupancyPct < 45) {
    issues.push({
      title: "Niska zajętość magazynu",
      impact: "Część pojemności nie pracuje i generuje koszt utrzymania bez zwrotu.",
      recommendation: "Skonsolidować asortyment i ograniczyć rozproszenie zapasu między strefami.",
    });
  }
  if (input.reserveUsedSharePct > 55) {
    issues.push({
      title: "Wysoki udział zapasu wolnorotującego",
      impact: "Kapitał jest zamrożony w strefach rezerwowych przez dłuższy czas.",
      recommendation: "Uruchomić przegląd zapasu i akcję redukcji pozycji o niskiej rotacji.",
    });
  }
  if (input.storageUtilSpreadPct > 35) {
    issues.push({
      title: "Nierównomierne wykorzystanie stref",
      impact: "Wybrane segmenty są przeciążone, a inne pozostają niedowykorzystane.",
      recommendation: "Przebudować zasady odkładania i uzupełniania między segmentami.",
    });
  }
  if (input.top5SharePct > 75) {
    issues.push({
      title: "Wysoka koncentracja wartości",
      impact: "Wynik finansowy magazynu zależy od wąskiej grupy produktów.",
      recommendation: "Wzmocnić kontrolę dostępności i planowanie dla kluczowych SKU.",
    });
  }
  if (input.mismatchSharePct > 10) {
    issues.push({
      title: "Rozbieżność stanów systemowych i fizycznych",
      impact: "Planowanie zapasu może opierać się na danych odbiegających od stanu faktycznego.",
      recommendation: "Wprowadzić cykliczną rekonsyliację quantity oczekiwanej do sumy inventory.quantity.",
    });
  }
  if (issues.length === 0) {
    issues.push({
      title: "Brak krytycznych odchyleń",
      impact: "Aktualne wskaźniki są zbilansowane na poziomie zarządczym.",
      recommendation: "Utrzymać bieżący rytm monitoringu i miesięczny przegląd KPI.",
    });
  }
  return issues;
}

export type BuildExecutiveReportDataInput = {
  layout: LayoutState;
  inventoryRows: InventoryRow[];
  products: WarehouseProduct[];
};

export function buildWarehouseExecutiveReportData(
  input: BuildExecutiveReportDataInput
): WarehouseExecutiveReportData {
  const { layout, inventoryRows, products } = input;
  const metricsProducts: MetricsProductInput[] = products.map((p) => ({
    id: String(p.id),
    volume_dm3: typeof p.volume_dm3 === "number" && Number.isFinite(p.volume_dm3) ? p.volume_dm3 : 0,
    purchase_price:
      typeof p.purchase_price === "number" && Number.isFinite(p.purchase_price) ? p.purchase_price : 0,
  }));
  const snapshot = computeWarehouseMetrics({
    layout,
    inventoryRows,
    products: metricsProducts,
  });

  const totalInventoryValuePln = snapshot.inventoryValue.totalValue;
  const occupancyPct = snapshot.occupancy.occupancyPercent;
  const freeSpacePct = Math.max(0, 100 - occupancyPct);
  const nameById = productNameById(products);
  const priceById = productPriceById(products);
  const layoutUuidSet = new Set(binsByLocationUuid(layout).keys());
  const allValues = allProductValues(
    inventoryRows,
    layoutUuidSet,
    nameById,
    priceById
  );
  const productCount = activeProductCount(inventoryRows, layoutUuidSet);
  const topProducts = allValues.slice(0, 5).map((x) => ({
    ...x,
    sharePct: totalInventoryValuePln > 0 ? (x.valuePln / totalInventoryValuePln) * 100 : 0,
  }));
  const top5SharePct = topProducts.reduce((s, p) => s + p.sharePct, 0);
  const reconciliation = quantityReconciliation({
    products,
    inventoryRows,
    layoutUuidSet,
    nameById,
  });

  const usedByType = usedVolumeByStorageType(layout, inventoryRows, products);
  const capacityByType = snapshot.capacity.byStorageType;
  const storageUsage: StorageUsageRow[] = (["primary", "reserve", "damaged", "pick", "buffer", "unknown"] as const).map(
    (key) => {
      const cap = capacityByType[key].volumeDm3;
      const used = usedByType[key];
      return {
        key,
        label: STORAGE_LABEL[key],
        usedDm3: used,
        capacityDm3: cap,
        utilizationPct: cap > 0 ? Math.min(100, (used / cap) * 100) : 0,
      };
    }
  );
  const dominantStorage = [...storageUsage].sort((a, b) => b.utilizationPct - a.utilizationPct)[0];
  const minStorageUtil = Math.min(...storageUsage.map((x) => x.utilizationPct));
  const maxStorageUtil = Math.max(...storageUsage.map((x) => x.utilizationPct));
  const reserveUsedSharePct =
    snapshot.occupancy.totalUsedVolumeDm3 > 0
      ? (usedByType.reserve / snapshot.occupancy.totalUsedVolumeDm3) * 100
      : 0;

  return {
    warehouseName: String(layout.warehouse_name ?? layout.name ?? "Magazyn").trim() || "Magazyn",
    exportDate: new Date().toLocaleString("pl-PL"),
    totalInventoryValuePln,
    occupancyPct,
    freeSpacePct,
    productCount,
    insights: buildInsights({
      occupancyPct,
      freeSpacePct,
      top5SharePct,
      dominantStorageLabel: dominantStorage?.label ?? "Podstawowe",
      dominantStorageUtilPct: dominantStorage?.utilizationPct ?? 0,
      mismatchSharePct: reconciliation.mismatchSharePct,
    }),
    topProductsByValue: topProducts,
    top5SharePct,
    storageUsage,
    occupancyBreakdown: {
      usedDm3: snapshot.occupancy.totalUsedVolumeDm3,
      freeDm3: Math.max(0, snapshot.occupancy.totalCapacityVolumeDm3 - snapshot.occupancy.totalUsedVolumeDm3),
      totalDm3: snapshot.occupancy.totalCapacityVolumeDm3,
    },
    quantityReconciliation: reconciliation,
    issues: buildIssues({
      occupancyPct,
      freeSpacePct,
      reserveUsedSharePct,
      top5SharePct,
      storageUtilSpreadPct: maxStorageUtil - minStorageUtil,
      mismatchSharePct: reconciliation.mismatchSharePct,
    }),
  };
}
