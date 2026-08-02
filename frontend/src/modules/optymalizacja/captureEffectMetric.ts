/**
 * Odczyt istniejących metryk do oceny efektów — bez nowych algorytmów.
 * Zwraca null gdy danych brak (UI: „Oczekuje na dane”).
 */

import { getWalkingCost } from "../../api/analysisApi";
import {
  ANALIZY_DEFAULT_TENANT_ID,
  type WarehouseApiScope,
} from "../analizy/warehouseApiScope";
import type { ChangeSource, EffectMetric } from "./warehouseChangePlanStore";

function avgFinite(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function toScope(
  scopeOrWarehouseId?: WarehouseApiScope | number | null
): WarehouseApiScope | null {
  if (scopeOrWarehouseId == null) return null;
  if (typeof scopeOrWarehouseId === "number") {
    if (!Number.isFinite(scopeOrWarehouseId) || scopeOrWarehouseId < 1) return null;
    return { tenantId: ANALIZY_DEFAULT_TENANT_ID, warehouseId: scopeOrWarehouseId };
  }
  return scopeOrWarehouseId;
}

/**
 * Próbuje pobrać metrykę bazową dla źródła zmiany z już istniejących API.
 */
export async function captureExistingEffectMetric(
  source: ChangeSource,
  scopeOrWarehouseId?: WarehouseApiScope | number | null
): Promise<EffectMetric | null> {
  const scope = toScope(scopeOrWarehouseId);
  if (scope == null) return null;

  if (source === "routes") {
    try {
      const items = await getWalkingCost(scope);
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
