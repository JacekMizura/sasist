import { useCallback, useEffect, useState } from "react";

import { fetchLiveEvents } from "../../api/operationalRuntimeApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import { useOperationalLiveStream } from "../useOperationalLiveStream";

export type RuntimeHealth = "live" | "polling" | "offline" | "disabled";

export function useOperationalRuntime(opts?: { enabled?: boolean }) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const enabled = opts?.enabled !== false && warehouseId != null;

  const [runtimeAvailable, setRuntimeAvailable] = useState(true);
  const [eventLagMs, setEventLagMs] = useState<number | null>(null);

  const { events, lastEventId, connected, subscribe } = useOperationalLiveStream({
    tenantId: DAMAGE_TENANT_ID,
    warehouseId,
    enabled: enabled && runtimeAvailable,
    useSse: true,
    pollMs: 5000,
  });

  const probeRuntime = useCallback(async () => {
    if (warehouseId == null) return;
    try {
      await fetchLiveEvents({ tenantId: DAMAGE_TENANT_ID, warehouseId, limit: 1 });
      setRuntimeAvailable(true);
    } catch {
      setRuntimeAvailable(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void probeRuntime();
  }, [probeRuntime]);

  useEffect(() => {
    const last = events[events.length - 1];
    if (!last?.created_at) {
      setEventLagMs(null);
      return;
    }
    const t = new Date(last.created_at).getTime();
    if (Number.isFinite(t)) setEventLagMs(Math.max(0, Date.now() - t));
  }, [events]);

  const health: RuntimeHealth = !runtimeAvailable
    ? "disabled"
    : connected
      ? "live"
      : enabled
        ? "polling"
        : "offline";

  return {
    tenantId: DAMAGE_TENANT_ID,
    warehouseId,
    enabled,
    runtimeAvailable,
    health,
    events,
    lastEventId,
    connected,
    eventLagMs,
    subscribe,
    refreshProbe: probeRuntime,
  };
}
