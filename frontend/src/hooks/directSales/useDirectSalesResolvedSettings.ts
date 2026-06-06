import { useCallback, useEffect, useState } from "react";

import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { getDirectSalesSettings } from "../../modules/wmsSettings/directSales/api/directSalesSettingsApi";
import {
  DEFAULT_DIRECT_SALES_SETTINGS,
  normalizeDirectSalesSettings,
  type DirectSalesSettingsConfig,
} from "../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";

export type { DirectSalesSettingsConfig as ResolvedDirectSalesSettings } from "../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";

/**
 * Loads resolved direct-sales business config for the operator terminal (warehouse scope).
 */
export function useDirectSalesResolvedSettings(warehouseId: number | null) {
  const [resolvedDirectSalesSettings, setResolvedDirectSalesSettings] =
    useState<DirectSalesSettingsConfig>(DEFAULT_DIRECT_SALES_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (warehouseId == null) {
      setResolvedDirectSalesSettings(DEFAULT_DIRECT_SALES_SETTINGS);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const read = await getDirectSalesSettings({ tenantId: DAMAGE_TENANT_ID, warehouseId });
      setResolvedDirectSalesSettings(normalizeDirectSalesSettings(read.resolved));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się wczytać ustawień sprzedaży.");
      setResolvedDirectSalesSettings(DEFAULT_DIRECT_SALES_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { resolvedDirectSalesSettings, loading, error, reload };
}
