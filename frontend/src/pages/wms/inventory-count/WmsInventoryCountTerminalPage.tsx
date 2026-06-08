import { useParams } from "react-router-dom";

import { useWmsInventoryTerminalPage } from "@/modules/inventoryCount/hooks/useWmsInventoryTerminalPage";
import WmsInventoryTerminalView, {
  WmsInventoryTerminalErrorState,
  WmsInventoryTerminalLoadingState,
} from "@/modules/inventoryCount/ui/wms/WmsInventoryTerminalView";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { WMS_INV } from "@/modules/inventoryCount/ui/wms/theme";
import { useWarehouse } from "@/context/WarehouseContext";

const TENANT_ID = 1;

/** WMS counting terminal — thin route shell. */
export default function WmsInventoryCountTerminalPage() {
  const { taskId: taskIdParam, documentId: documentIdParam } = useParams();
  const taskId = taskIdParam ? Number(taskIdParam) : NaN;
  const documentId = documentIdParam ? Number(documentIdParam) : NaN;
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id;

  const state = useWmsInventoryTerminalPage(
    Number.isFinite(taskId) ? taskId : undefined,
    Number.isFinite(documentId) ? documentId : undefined,
    TENANT_ID,
    warehouseId,
  );

  const backHref = Number.isFinite(documentId)
    ? wmsInventoryCountPaths.document(documentId)
    : wmsInventoryCountPaths.root;

  if (!warehouseId) {
    return <p className={`py-4 ${WMS_INV.textMuted} text-sm font-bold`}>Wybierz magazyn.</p>;
  }

  if (state.terminal.loading && !state.terminal.task) {
    return <WmsInventoryTerminalLoadingState />;
  }

  if (!Number.isFinite(taskId)) {
    return <WmsInventoryTerminalErrorState message="Brak lokalizacji w adresie URL." backHref={backHref} />;
  }

  if (state.terminal.error) {
    return <WmsInventoryTerminalErrorState message={state.terminal.error} backHref={backHref} />;
  }

  return <WmsInventoryTerminalView state={state} documentId={documentId} />;
}
