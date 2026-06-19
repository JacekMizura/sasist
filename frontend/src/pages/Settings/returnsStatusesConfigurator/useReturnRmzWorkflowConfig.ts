import { useCallback, useEffect, useState } from "react";

import {
  createReturnStatus,
  deleteReturnStatus,
  listReturnStatuses,
  updateReturnStatus,
} from "../../../api/returnStatusesApi";
import type { ReturnStatusCreatePayload, ReturnStatusRead, ReturnStatusUpdatePayload } from "../../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";

export function useReturnRmzWorkflowConfig(warehouseId: number | null) {
  const [rows, setRows] = useState<ReturnStatusRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await listReturnStatuses(DAMAGE_TENANT_ID, warehouseId);
      setRows(data);
    } catch {
      setErr("Nie udało się wczytać statusów procesu RMZ.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveStatus = async (id: number, payload: ReturnStatusUpdatePayload) => {
    if (warehouseId == null) return false;
    try {
      await updateReturnStatus(id, DAMAGE_TENANT_ID, warehouseId, payload);
      await load();
      return true;
    } catch {
      setErr("Nie udało się zapisać etapu procesu.");
      return false;
    }
  };

  const createStatus = async (body: ReturnStatusCreatePayload) => {
    if (warehouseId == null) return false;
    try {
      await createReturnStatus(DAMAGE_TENANT_ID, warehouseId, body);
      await load();
      return true;
    } catch {
      setErr("Nie udało się dodać etapu (sprawdź unikalność klucza workflow).");
      return false;
    }
  };

  const removeStatus = async (id: number) => {
    if (warehouseId == null) return false;
    if (!window.confirm("Usunąć ten etap? Nie można, jeśli jest przypisany do zwrotów.")) return false;
    try {
      await deleteReturnStatus(id, DAMAGE_TENANT_ID, warehouseId);
      await load();
      return true;
    } catch {
      setErr("Nie udało się usunąć etapu (może być używany).");
      return false;
    }
  };

  return { rows, loading, err, setErr, reload: load, saveStatus, createStatus, removeStatus };
}
