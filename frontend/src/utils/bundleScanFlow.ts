import type {
  BundleBarcodeResolveOut,
  BundleScanComponentOut,
  BundleScanOut,
  ConsolidationRackBundleRowOut,
} from "../api/bundlesLogisticsApi";

export type BundlePickingDisplay = {
  title: string;
  subtitle: string;
  mode: "ON_DEMAND" | "STOCK";
  components: Array<{
    order_item_id: number;
    product_name: string;
    index: number;
    total: number;
    pick_done: boolean;
    quantity_to_pick: number;
  }>;
  doneCount: number;
  totalCount: number;
};

export type BundleBulkScanLogEntry = {
  id: string;
  barcode: string;
  scanned_at: string;
  status: "ok" | "error";
  message: string;
};

export function isStockBundleMode(mode: string | null | undefined): boolean {
  return String(mode ?? "").toUpperCase() === "STOCK_PRODUCTION";
}

export function bundleDisplayTitle(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  return n || "Pakiet promocyjny";
}

export function buildPickingBundleDisplay(scan: BundleScanOut): BundlePickingDisplay | null {
  if (!scan.found) return null;
  const stock = isStockBundleMode(scan.bundle_fulfillment_mode);
  if (stock) {
    return {
      title: bundleDisplayTitle(scan.bundle_name),
      subtitle: "STOCK — linia bundle SKU",
      mode: "STOCK",
      components: [],
      doneCount: 1,
      totalCount: 1,
    };
  }
  const comps = scan.missing_components ?? [];
  const knownIdx = comps
    .map((c) => c.bundle_component_index)
    .filter((n): n is number => n != null && n >= 1);
  const totalFromIdx = knownIdx.length > 0 ? Math.max(...knownIdx) : 0;
  const totalCount = Math.max(totalFromIdx, comps.length, 1);
  const doneCount = comps.filter((c) => c.pick_done).length;
  return {
    title: bundleDisplayTitle(scan.bundle_name),
    subtitle: `${totalCount} składnik${totalCount === 1 ? "" : totalCount < 5 ? "i" : "ów"}`,
    mode: "ON_DEMAND",
    components: comps.map((c, i) => componentRow(c, totalCount, i + 1)),
    doneCount,
    totalCount,
  };
}

function componentRow(
  c: BundleScanComponentOut,
  fallbackTotal: number,
  fallbackIndex: number,
): BundlePickingDisplay["components"][0] {
  const raw = c.bundle_component_index;
  const idx = raw != null && raw >= 1 ? raw : fallbackIndex;
  const total = fallbackTotal > 0 ? fallbackTotal : 1;
  return {
    order_item_id: c.order_item_id,
    product_name: c.product_name,
    index: idx,
    total,
    pick_done: c.pick_done,
    quantity_to_pick: c.quantity_to_pick,
  };
}

export function pickingBundleProgressLabel(display: BundlePickingDisplay): string {
  if (display.mode === "STOCK") return "Zebrano";
  return `${display.doneCount}/${display.totalCount}`;
}

export function packingBundleVerifiedMessage(scan: BundleScanOut): string | null {
  if (!scan.found) return null;
  if (scan.action === "verify_bundle" && scan.bundle_verified) return "Bundle zweryfikowany";
  if (scan.action === "pack_stock_line") return "Bundle SKU spakowany";
  if (scan.action === "components_incomplete") return "Nie wszystkie składniki zebrane";
  return scan.message ?? null;
}

export function shouldShowBundleVerifiedBadge(scan: BundleScanOut): boolean {
  return Boolean(scan.found && scan.bundle_verified && scan.action === "verify_bundle");
}

export function bundleTraceabilityEntries(links: Record<string, string | null | undefined>): Array<{ key: string; label: string; href: string }> {
  const out: Array<{ key: string; label: string; href: string }> = [];
  const map: Record<string, string> = {
    bundle_lots: "Partie bundle",
    recall_report: "Recall",
    returns_tree: "Zwroty",
    complaint_search: "Reklamacje",
  };
  for (const [key, label] of Object.entries(map)) {
    const href = links[key];
    if (href && String(href).trim()) out.push({ key, label, href: String(href).trim() });
  }
  return out;
}

export function consolidationRackHeading(rows: ConsolidationRackBundleRowOut[]): string {
  if (rows.length === 0) return "Regał kompletacyjny";
  if (rows.every((r) => r.display_mode === "stock_finished_bundle")) return "Pakiet promocyjny";
  if (rows.every((r) => r.display_mode === "on_demand_component")) return "Składniki zestawu";
  return "Zestawy na półce";
}

export function returnsBundleOrderIds(scan: BundleScanOut): number[] {
  return (scan.return_tree_order_ids ?? []).filter((id) => Number.isFinite(id) && id > 0);
}

export function isBundleBarcodeResolve(match: BundleBarcodeResolveOut | null | undefined): boolean {
  return Boolean(match?.found && (match.bundle_id != null || match.is_stock_logistic_sku));
}

export function bulkScanLogEntry(
  barcode: string,
  ok: boolean,
  message: string,
): BundleBulkScanLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    barcode,
    scanned_at: new Date().toISOString(),
    status: ok ? "ok" : "error",
    message,
  };
}

export function appendBulkScanLog(
  prev: BundleBulkScanLogEntry[],
  entry: BundleBulkScanLogEntry,
  cap = 100,
): BundleBulkScanLogEntry[] {
  return [entry, ...prev].slice(0, cap);
}
