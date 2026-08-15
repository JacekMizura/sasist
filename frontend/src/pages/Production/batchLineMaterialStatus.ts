import { formatProductionQuantity } from "./productionUi";

/** BOM structure only — never use per-recipe stock from recipe detail for availability. */
export type BomRequirement = {
  componentProductId: number;
  requiredPerUnit: number;
};

/** Snapshot from batch preview SSOT (`aggregated_components`). */
export type AggregatedComponentAvail = {
  component_product_id: number;
  required: number;
  available: number;
  missing: number;
};

export type BatchLineInput = {
  key: string;
  compositionId: number;
  plannedQuantity: number;
};

export type LineMaterialStatus = {
  ok: boolean;
  missingQty: number;
  /** e.g. "Materiały: Dostępne" | "Materiały: Brak 6 szt." */
  label: string;
};

/**
 * Attribute batch-level material shortages to FG lines using one preview SSOT.
 * Shared components: proportional share of aggregate `missing` by each line's required qty.
 * Never checks stock independently per line.
 */
export function computeLineMaterialStatuses(
  lines: BatchLineInput[],
  bomByCompositionId: Record<number, BomRequirement[]>,
  aggregated: AggregatedComponentAvail[],
): Record<string, LineMaterialStatus> {
  const aggById = new Map(aggregated.map((a) => [a.component_product_id, a]));
  const out: Record<string, LineMaterialStatus> = {};

  for (const line of lines) {
    const bom = bomByCompositionId[line.compositionId] ?? [];
    let attributedMissing = 0;

    if (bom.length === 0) {
      // Single-line: aggregate missing is exactly this line's shortage.
      if (lines.length === 1) {
        attributedMissing = aggregated.reduce((sum, a) => sum + Math.max(0, a.missing), 0);
      }
    } else {
      for (const req of bom) {
        const agg = aggById.get(req.componentProductId);
        if (!agg || agg.missing <= 1e-9) continue;
        const lineReq = req.requiredPerUnit * line.plannedQuantity;
        if (lineReq <= 1e-9 || agg.required <= 1e-9) continue;
        attributedMissing += (lineReq / agg.required) * agg.missing;
      }
    }

    const missingQty = attributedMissing <= 1e-6 ? 0 : attributedMissing;
    const ok = missingQty <= 1e-6;
    out[line.key] = {
      ok,
      missingQty,
      label: ok
        ? "Materiały: Dostępne"
        : `Materiały: Brak ${formatProductionQuantity(missingQty)} szt.`,
    };
  }

  return out;
}
