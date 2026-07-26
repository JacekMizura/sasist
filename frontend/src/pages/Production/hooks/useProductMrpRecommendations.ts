import { useCallback, useEffect, useState } from "react";

import {
  fetchProductionDemandPlanning,
  type ProductionDemandProductRow,
} from "@/api/productionPlanningApi";

export type HorizonKey = "today" | "3" | "7" | "14" | "21" | "30" | "max";

export type HorizonTile = {
  key: HorizonKey;
  label: string;
  /** Suggested qty; null → show "—" (no MRP data / zero need). */
  quantity: number | null;
};

const HORIZON_DEFS: Array<{ key: Exclude<HorizonKey, "max">; label: string; coverageDays: number }> = [
  { key: "today", label: "Dzisiaj", coverageDays: 1 },
  { key: "3", label: "3 dni", coverageDays: 3 },
  { key: "7", label: "7 dni", coverageDays: 7 },
  { key: "14", label: "14 dni", coverageDays: 14 },
  { key: "21", label: "21 dni", coverageDays: 21 },
  { key: "30", label: "30 dni", coverageDays: 30 },
];

function qtyOrNull(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  const n = Math.round(raw);
  return n > 0 ? n : null;
}

/**
 * Projected coverage after production — same formula as backend
 * `coverage_after_production` (display only; no new MRP).
 */
export function coverageAfterProductionDays(
  row: ProductionDemandProductRow | null,
  productionQty: number,
): number | null {
  if (!row) return null;
  const avg = Number(row.avg_daily_sales) || 0;
  if (avg <= 1e-9) return null;
  const lt = Math.max(0, Number(row.production_lead_time_days) || 0);
  const projected =
    Number(row.on_hand) + Number(row.in_pipeline) + Number(productionQty) - avg * lt;
  return Math.max(0, projected) / avg;
}

export function useProductMrpRecommendations(
  tenantId: number,
  warehouseId: number | null,
  productId: number | null,
  maxProducible: number | null,
) {
  const [tiles, setTiles] = useState<HorizonTile[]>([]);
  const [demandRow, setDemandRow] = useState<ProductionDemandProductRow | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (warehouseId == null || productId == null) {
      setTiles([]);
      setDemandRow(null);
      return;
    }
    setLoading(true);
    try {
      const snaps = await Promise.all(
        HORIZON_DEFS.map((h) =>
          fetchProductionDemandPlanning({
            tenantId,
            warehouseId,
            coverageDays: h.coverageDays,
          }).then((data) => {
            const row = data.products.find((p) => p.product_id === productId) ?? null;
            return { def: h, row };
          }),
        ),
      );

      const row21 = snaps.find((s) => s.def.key === "21")?.row ?? snaps.find((s) => s.row)?.row ?? null;
      setDemandRow(row21);

      const horizonTiles: HorizonTile[] = snaps.map(({ def, row }) => ({
        key: def.key,
        label: def.label,
        quantity: qtyOrNull(row?.recommended_quantity),
      }));

      const maxQty = qtyOrNull(maxProducible);
      horizonTiles.push({ key: "max", label: "Maksimum", quantity: maxQty });
      setTiles(horizonTiles);
    } catch {
      setTiles(
        HORIZON_DEFS.map((h) => ({ key: h.key, label: h.label, quantity: null })).concat([
          { key: "max", label: "Maksimum", quantity: qtyOrNull(maxProducible) },
        ]),
      );
      setDemandRow(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, productId, maxProducible]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { tiles, demandRow, loading, reload };
}
