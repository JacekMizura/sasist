import { useCallback, useEffect, useState } from "react";

import type { OrderAutomationModuleSettings } from "../types/orderAutomation";
import {
  loadOrderAutomationModuleSettings,
  saveOrderAutomationModuleSettings,
} from "../utils/orderAutomationLocalStore";
import { migrateOrderAutomationModuleSettings } from "../utils/orderAutomationModuleSettings";

export function useOrderAutomationModuleSettings(tenantId: number, warehouseId: number | null) {
  const [settings, setSettings] = useState<OrderAutomationModuleSettings>(() =>
    migrateOrderAutomationModuleSettings(undefined),
  );
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(() => {
    if (warehouseId == null) {
      setSettings(migrateOrderAutomationModuleSettings(undefined));
      setHydrated(true);
      return;
    }
    setSettings(loadOrderAutomationModuleSettings(tenantId, warehouseId));
    setHydrated(true);
  }, [tenantId, warehouseId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateSettings = useCallback(
    (patch: Partial<OrderAutomationModuleSettings>) => {
      if (warehouseId == null) return;
      setSettings((prev) => {
        const next = migrateOrderAutomationModuleSettings({ ...prev, ...patch });
        saveOrderAutomationModuleSettings(tenantId, warehouseId, next);
        return next;
      });
    },
    [tenantId, warehouseId],
  );

  return { settings, hydrated, reload, updateSettings };
}
