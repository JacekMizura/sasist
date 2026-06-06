import { useCallback, useEffect, useRef, useState } from "react";

import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import {
  cachedOrDefaultSettings,
  readCachedDirectSalesSettings,
  shouldRefreshCachedSettings,
  writeCachedDirectSalesSettings,
} from "../../modules/directSales/settings/directSalesSettingsCache";
import { getDirectSalesSettings } from "../../modules/wmsSettings/directSales/api/directSalesSettingsApi";
import {
  normalizeDirectSalesSettings,
  type DirectSalesSettingsConfig,
} from "../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";

export type { DirectSalesSettingsConfig as ResolvedDirectSalesSettings } from "../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";

const STALE_MS = 5 * 60 * 1000;

/**
 * Cache-first direct sales settings — instant terminal startup, silent API refresh.
 */
export function useDirectSalesResolvedSettings(warehouseId: number | null) {
  const tenantId = DAMAGE_TENANT_ID;
  const [resolvedDirectSalesSettings, setResolvedDirectSalesSettings] = useState<DirectSalesSettingsConfig>(
    () => (warehouseId != null ? cachedOrDefaultSettings(tenantId, warehouseId) : cachedOrDefaultSettings(tenantId, 0)),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef(0);

  const applyFromApi = useCallback((read: Awaited<ReturnType<typeof getDirectSalesSettings>>) => {
    const normalized = normalizeDirectSalesSettings(read.resolved);
    setResolvedDirectSalesSettings(normalized);
    writeCachedDirectSalesSettings(read);
    setError(null);
  }, []);

  const refreshFromApi = useCallback(
    async (opts?: { force?: boolean }) => {
      if (warehouseId == null) return;
      const now = Date.now();
      if (!opts?.force && now - lastFetchRef.current < STALE_MS) return;
      const cached = readCachedDirectSalesSettings(tenantId, warehouseId);
      setRefreshing(true);
      try {
        const read = await getDirectSalesSettings({ tenantId, warehouseId });
        lastFetchRef.current = Date.now();
        if (shouldRefreshCachedSettings(cached, read)) {
          applyFromApi(read);
        }
      } catch (e) {
        if (!cached) {
          setError(e instanceof Error ? e.message : "Nie udało się wczytać ustawień sprzedaży.");
        }
      } finally {
        setRefreshing(false);
      }
    },
    [warehouseId, tenantId, applyFromApi],
  );

  useEffect(() => {
    if (warehouseId == null) {
      setResolvedDirectSalesSettings(cachedOrDefaultSettings(tenantId, 0));
      return;
    }
    const cached = readCachedDirectSalesSettings(tenantId, warehouseId);
    if (cached) {
      setResolvedDirectSalesSettings(cached.resolved);
    } else {
      setResolvedDirectSalesSettings(cachedOrDefaultSettings(tenantId, warehouseId));
    }
    void refreshFromApi({ force: true });
  }, [warehouseId, tenantId, refreshFromApi]);

  const reload = useCallback(async () => {
    await refreshFromApi({ force: true });
  }, [refreshFromApi]);

  return {
    resolvedDirectSalesSettings,
    loading: false,
    refreshing,
    error,
    reload,
  };
}
