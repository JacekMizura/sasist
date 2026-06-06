import type { LocationStockRow } from "../../../api/locationStockApi";
import { resolveLocationZoneKind } from "../../../components/directSales/stock/stockZoneStyles";
import type { ResolvedDirectSalesSettings } from "./resolvedDirectSalesSettings";

function storeFirstRank(kind: string): number {
  if (kind === "store") return 0;
  if (kind === "primary") return 1;
  if (kind === "reserve") return 2;
  if (kind === "showroom") return 3;
  if (kind === "blocked") return 9;
  return 4;
}

function neutralRank(kind: string): number {
  if (kind === "blocked") return 9;
  return 0;
}

/** Sort location picker rows according to resolved direct-sales settings. */
export function sortDirectSalesLocationRows(
  rows: LocationStockRow[],
  settings: Pick<ResolvedDirectSalesSettings, "prefer_store_locations">,
): LocationStockRow[] {
  const rank = settings.prefer_store_locations ? storeFirstRank : neutralRank;
  return [...rows].sort((a, b) => {
    const za = resolveLocationZoneKind(a.operational_zone_type);
    const zb = resolveLocationZoneKind(b.operational_zone_type);
    const dr = rank(za) - rank(zb);
    if (dr !== 0) return dr;
    if (settings.prefer_store_locations) {
      const pri = (b.sales_priority ?? 0) - (a.sales_priority ?? 0);
      if (pri !== 0) return pri;
    }
    return (a.code ?? "").localeCompare(b.code ?? "", "pl");
  });
}
