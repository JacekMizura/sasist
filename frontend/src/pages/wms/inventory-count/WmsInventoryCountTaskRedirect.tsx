import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { fetchWmsInventoryTask } from "@/api/inventoryCountApi";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { WMS_INV } from "@/modules/inventoryCount/wmsIndustrialTheme";
import { useWarehouse } from "@/context/WarehouseContext";

const TENANT_ID = 1;

/** Legacy deep link /count/:taskId → document-scoped route. */
export default function WmsInventoryCountTaskRedirect() {
  const { taskId: taskIdParam } = useParams();
  const { warehouse } = useWarehouse();
  const taskId = taskIdParam ? Number(taskIdParam) : NaN;
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(taskId)) {
      setFailed(true);
      return;
    }
    void fetchWmsInventoryTask(TENANT_ID, taskId)
      .then((t) => {
        setTarget(wmsInventoryCountPaths.count(t.inventory_document_id, t.id));
      })
      .catch(() => setFailed(true));
  }, [taskId]);

  if (target) return <Navigate to={target} replace />;
  if (failed) return <Navigate to={wmsInventoryCountPaths.root} replace />;
  return <p className={`py-4 text-sm ${WMS_INV.textMuted}`}>Przekierowanie…</p>;
}
