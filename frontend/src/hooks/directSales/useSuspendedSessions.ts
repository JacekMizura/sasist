import { useCallback, useEffect, useState } from "react";

import {
  cancelDirectSaleSession,
  listSuspendedDirectSaleSessions,
  resumeDirectSaleSession,
  type DirectSaleSuspendedSummary,
} from "../../api/directSalesApi";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";

type Args = {
  warehouseId: number | null;
  enabled?: boolean;
  refreshKey?: number;
};

export function useSuspendedSessions({ warehouseId, enabled = true, refreshKey = 0 }: Args) {
  const [rows, setRows] = useState<DirectSaleSuspendedSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listSuspendedDirectSaleSessions({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
      });
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(extractApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [enabled, warehouseId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const restore = useCallback(
    async (sessionId: number) => {
      setBusyId(sessionId);
      setError(null);
      try {
        await resumeDirectSaleSession({ tenantId: DAMAGE_TENANT_ID, warehouseId, sessionId });
        await refresh();
        return true;
      } catch (e) {
        setError(extractApiErrorMessage(e));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [refresh, warehouseId],
  );

  const cancel = useCallback(
    async (sessionId: number) => {
      setBusyId(sessionId);
      setError(null);
      try {
        await cancelDirectSaleSession({ tenantId: DAMAGE_TENANT_ID, warehouseId, sessionId });
        await refresh();
        return true;
      } catch (e) {
        setError(extractApiErrorMessage(e));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [refresh, warehouseId],
  );

  return { rows, loading, busyId, error, refresh, restore, cancel };
}
