import { useCallback, useEffect, useState } from "react";

import { fetchOperationalFeaturesDebug, type OperationalFeaturesDebugPayload } from "../../api/operationalFeaturesApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { isOperationalDebugVisible } from "../../services/operational/operationalDevMode";
import { getOperationalFeatureState, subscribeOperationalFeatures } from "../../services/operational/operationalFeatureGuard";
import type { RuntimeHealth } from "../runtime/useOperationalRuntime";

export type SseStatusLabel = "CONNECTED" | "FALLBACK" | "OFFLINE";

type Args = {
  warehouseId: number | null;
  health: RuntimeHealth;
  connected: boolean;
  liveMode?: string;
};

export function useOperationalStatus({ warehouseId, health, connected, liveMode }: Args) {
  const [features, setFeatures] = useState(getOperationalFeatureState());
  const [debugBundle, setDebugBundle] = useState<OperationalFeaturesDebugPayload | null>(null);
  const showDebug = isOperationalDebugVisible();

  useEffect(() => subscribeOperationalFeatures(() => setFeatures(getOperationalFeatureState())), []);

  const refreshDebug = useCallback(async () => {
    if (!showDebug || warehouseId == null) return;
    const bundle = await fetchOperationalFeaturesDebug(DAMAGE_TENANT_ID, warehouseId);
    setDebugBundle(bundle);
  }, [showDebug, warehouseId]);

  useEffect(() => {
    void refreshDebug();
  }, [refreshDebug, features.loaded]);

  const sseStatus: SseStatusLabel =
    health === "live" && connected ? "CONNECTED" : health === "polling" ? "FALLBACK" : "OFFLINE";

  return {
    showDebug,
    features,
    debugBundle,
    sseStatus,
    liveMode: liveMode ?? health,
    refreshDebug,
  };
}
