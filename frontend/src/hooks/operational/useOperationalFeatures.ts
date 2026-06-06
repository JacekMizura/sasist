import { useCallback, useEffect, useState } from "react";

import { fetchOperationalFeatures } from "../../api/operationalFeaturesApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import {
  getOperationalFeatureState,
  loadOperationalFeatures,
  resetOperationalFeatureCache,
  subscribeOperationalFeatures,
  type OperationalFeatureState,
} from "../../services/operational/operationalFeatureGuard";

export function useOperationalFeatures(warehouseId: number | null): OperationalFeatureState & {
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<OperationalFeatureState>(getOperationalFeatureState());

  useEffect(() => subscribeOperationalFeatures(() => setState(getOperationalFeatureState())), []);

  const refresh = useCallback(async () => {
    if (warehouseId == null) return;
    resetOperationalFeatureCache();
    const next = await loadOperationalFeatures(DAMAGE_TENANT_ID, warehouseId, fetchOperationalFeatures);
    setState(next);
  }, [warehouseId]);

  useEffect(() => {
    if (warehouseId == null) {
      setState(getOperationalFeatureState());
      return;
    }
    let cancelled = false;
    void loadOperationalFeatures(DAMAGE_TENANT_ID, warehouseId, fetchOperationalFeatures).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  return { ...state, refresh };
}
