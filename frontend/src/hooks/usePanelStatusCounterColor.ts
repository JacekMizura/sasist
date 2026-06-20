import { useCallback, useEffect, useState } from "react";

import type { PanelStatusCounterColorModule } from "../utils/panelStatusCounterColorStore";
import {
  getPanelStatusCounterColor,
  setPanelStatusCounterColor,
} from "../utils/panelStatusCounterColorStore";

export function usePanelStatusCounterColor(
  module: PanelStatusCounterColorModule,
  tenantId: number,
  warehouseId: number | null,
  statusId: number | null,
) {
  const [counterColor, setCounterColorState] = useState<string | null>(null);

  useEffect(() => {
    if (warehouseId == null || statusId == null) {
      setCounterColorState(null);
      return;
    }
    setCounterColorState(getPanelStatusCounterColor(module, tenantId, warehouseId, statusId));
  }, [module, tenantId, warehouseId, statusId]);

  const setCounterColor = useCallback(
    (hex: string | null) => {
      setCounterColorState(hex);
      if (warehouseId != null && statusId != null) {
        setPanelStatusCounterColor(module, tenantId, warehouseId, statusId, hex);
      }
    },
    [module, tenantId, warehouseId, statusId],
  );

  const persistForStatusId = useCallback(
    (id: number, hex: string | null) => {
      if (warehouseId == null) return;
      setPanelStatusCounterColor(module, tenantId, warehouseId, id, hex);
    },
    [module, tenantId, warehouseId],
  );

  return { counterColor, setCounterColor, persistForStatusId };
}

/** Callback dla sidebara list — odczyt kolorów licznika z localStorage. */
export function panelStatusCounterColorResolver(
  module: PanelStatusCounterColorModule,
  tenantId: number,
  warehouseId: number,
): (statusId: number) => string | null {
  return (statusId: number) => getPanelStatusCounterColor(module, tenantId, warehouseId, statusId);
}
