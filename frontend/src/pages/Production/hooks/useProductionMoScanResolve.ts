import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import { resolveProductionOrderByScan } from "@/api/productionApi";
import { useWarehouse } from "@/context/WarehouseContext";
import { useWmsPageScanHandler } from "@/components/wms/execution/useWmsPageScanHandler";
import { erpProductionPaths, wmsProductionPaths } from "../productionPaths";

const DEFAULT_TENANT = 1;

/**
 * Global WMS production terminal: scan MO barcode from printed card → open existing execution UI.
 */
export function useProductionMoScanResolve(enabled = true) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;

  const handler = useCallback(
    (code: string) => {
      if (warehouseId == null) return;
      const raw = String(code || "").trim();
      if (!raw) return;
      void (async () => {
        try {
          const order = await resolveProductionOrderByScan(tenantId, raw, warehouseId);
          const status = String(order.status || "").toLowerCase();
          const printOrErp =
            Boolean(order.is_print_interface) ||
            Boolean(order.is_erp_interface) ||
            String(order.execution_interface || "").toUpperCase() === "PRINT";
          if (printOrErp) {
            navigate(erpProductionPaths.erpExecution("order", order.id));
            toast.success(`Otwarto zlecenie ${order.number}`);
            return;
          }
          if (status === "in_progress") {
            navigate(wmsProductionPaths.execute("order", order.id));
          } else if (status === "collecting" || status === "planned" || status === "draft") {
            navigate(wmsProductionPaths.collecting("order", order.id));
          } else if (status === "awaiting_putaway" || status === "putaway") {
            navigate(wmsProductionPaths.putaway("order", order.id));
          } else {
            navigate(erpProductionPaths.order(order.id));
          }
          toast.success(`Otwarto zlecenie ${order.number}`);
        } catch {
          toast.error("Nie znaleziono zlecenia produkcyjnego dla zeskanowanego kodu.");
        }
      })();
    },
    [navigate, tenantId, warehouseId],
  );

  useWmsPageScanHandler(enabled ? handler : null, enabled && warehouseId != null);
}
