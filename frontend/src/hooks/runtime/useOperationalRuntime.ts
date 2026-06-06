import { useCallback, useEffect, useState } from "react";

import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import { useOperationalFeatures } from "../operational/useOperationalFeatures";
import { useOperationalLiveStream } from "../useOperationalLiveStream";

export type RuntimeHealth = "live" | "polling" | "offline" | "disabled";

export function useOperationalRuntime(opts?: { enabled?: boolean }) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const features = useOperationalFeatures(warehouseId);
  const runtimeAvailable = features.runtimeEnabled;
  const streamEnabled = opts?.enabled !== false && warehouseId != null && features.loaded && runtimeAvailable;

  const [eventLagMs, setEventLagMs] = useState<number | null>(null);

  const { events, lastEventId, connected, liveMode, subscribe } = useOperationalLiveStream({
    tenantId: DAMAGE_TENANT_ID,
    warehouseId,
    enabled: streamEnabled,
    pollMs: 8000,
  });

  useEffect(() => {
    const last = events[events.length - 1];
    if (!last?.created_at) {
      setEventLagMs(null);
      return;
    }
    const t = new Date(last.created_at).getTime();
    if (Number.isFinite(t)) setEventLagMs(Math.max(0, Date.now() - t));
  }, [events]);

  const health: RuntimeHealth = !features.loaded
    ? "offline"
    : !runtimeAvailable
      ? "disabled"
      : connected && liveMode === "sse"
        ? "live"
        : connected && liveMode === "polling"
          ? "polling"
          : streamEnabled
            ? "offline"
            : "disabled";

  const refreshProbe = useCallback(async () => {
    await features.refresh();
  }, [features]);

  return {
    tenantId: DAMAGE_TENANT_ID,
    warehouseId,
    enabled: streamEnabled,
    runtimeAvailable,
    featuresLoaded: features.loaded,
    directSalesEnabled: features.directSalesEnabled,
    directSalesSearchEnabled: features.directSalesSearchEnabled,
    replenishmentEnabled: features.replenishmentEnabled,
    health,
    events,
    lastEventId,
    connected,
    liveMode,
    eventLagMs,
    subscribe,
    refreshProbe,
    refreshFeatures: features.refresh,
  };
}
