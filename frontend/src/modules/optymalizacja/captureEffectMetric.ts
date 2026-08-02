/**
 * Odczyt istniejących metryk do oceny efektów — bez nowych algorytmów.
 * Zwraca null gdy danych brak (UI: „Oczekuje na dane”).
 */

import { getWalkingCost } from "../../api/analysisApi";
import type { ChangeSource, EffectMetric } from "./warehouseChangePlanStore";

const DEFAULT_TENANT_ID = 1;

function avgFinite(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Próbuje pobrać metrykę bazową dla źródła zmiany z już istniejących API.
 */
export async function captureExistingEffectMetric(
  source: ChangeSource,
  warehouseId?: number | null
): Promise<EffectMetric | null> {
  if (source === "routes") {
    try {
      const items = await getWalkingCost(DEFAULT_TENANT_ID, warehouseId ?? undefined);
      const vals = items
        .map((i) => i.total_distance)
        .filter((d): d is number => d != null && Number.isFinite(d));
      const avg = avgFinite(vals);
      if (avg == null) return null;
      return {
        label: "Średni dystans kompletacji",
        value: Math.round(avg * 10) / 10,
        unit: "m",
        capturedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
  // Slotting / strategia — brak prostego odczytu „po” bez nowych KPI → null.
  return null;
}
