import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import { queuePrintJob } from "../api/printingApi";
import { extractApiErrorMessage, extractApiOperationalErrorDetail } from "../api/apiErrorMessage";
import type { QueuePrintRequest } from "../types/printing";
import { NO_ACTIVE_AGENT_USER_MESSAGE } from "../components/printing/hasDefaultCloudPrinter";
import { packingSessionWorkstationId } from "../pages/wms/wmsPackingSession";

const QUEUE_SUCCESS_MSG = "Dokument został wysłany do drukowania";

type Options = {
  tenantId: number;
  warehouseId?: number | null;
};

function queueFailureMessage(err: unknown): string {
  const op = extractApiOperationalErrorDetail(err);
  if (op?.code === "NO_ACTIVE_AGENT" || op?.code === "AGENT_OFFLINE") {
    return op.code === "NO_ACTIVE_AGENT" ? NO_ACTIVE_AGENT_USER_MESSAGE : op.message;
  }
  if (op?.code === "NO_WORKSTATION" || op?.code === "NO_WORKSTATION_MAPPING") {
    return op.message || "Brak mapowania drukarki na stanowisku. Wybierz inne stanowisko lub skonfiguruj mapowanie.";
  }
  if (op?.message) return op.message;
  return extractApiErrorMessage(err, "Nie udało się wysłać do drukowania.");
}

function resolveWorkstationId(explicit?: number | null): number | null {
  if (explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) >= 1) {
    return Math.floor(Number(explicit));
  }
  return packingSessionWorkstationId();
}

/**
 * Queue prints: explicit workstationId (from picker/flow) or packing-session SSOT.
 */
export function useQueuePrint({ tenantId, warehouseId }: Options) {
  const [busy, setBusy] = useState(false);

  const queuePrint = useCallback(
    async (body: QueuePrintRequest, workstationId?: number | null) => {
      if (busy) return false;
      const workstation_id = resolveWorkstationId(workstationId ?? body.workstation_id);
      if (workstation_id == null) {
        toast.error("Wybierz miejsce wydruku.");
        return false;
      }
      setBusy(true);
      try {
        await queuePrintJob(tenantId, {
          ...body,
          warehouse_id: body.warehouse_id ?? warehouseId ?? null,
          workstation_id,
        });
        toast.success(QUEUE_SUCCESS_MSG);
        return true;
      } catch (err) {
        toast.error(queueFailureMessage(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, tenantId, warehouseId],
  );

  const queueStockDocument = useCallback(
    (
      documentId: number,
      warehouseIdOverride?: number | null,
      workstationId?: number | null,
      templateVersionId?: number | null,
    ) =>
      queuePrint(
        {
          document_type: "stock_document",
          document_id: documentId,
          warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
          template_version_id: templateVersionId ?? null,
          copies: 1,
        },
        workstationId,
      ),
    [queuePrint, warehouseId],
  );

  const queueSaleDocument = useCallback(
    (
      documentId: string,
      warehouseIdOverride?: number | null,
      workstationId?: number | null,
      templateVersionId?: number | null,
    ) =>
      queuePrint(
        {
          document_type: "sale_document",
          document_id_str: documentId,
          warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
          template_version_id: templateVersionId ?? null,
          copies: 1,
        },
        workstationId,
      ),
    [queuePrint, warehouseId],
  );

  const queueLabelPrint = useCallback(
    (
      label: NonNullable<QueuePrintRequest["label"]>,
      warehouseIdOverride?: number | null,
      printerSelection?: Pick<QueuePrintRequest, "printer_id" | "printer_profile_id">,
      workstationId?: number | null,
    ) =>
      queuePrint(
        {
          document_type: "label",
          label,
          warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
          copies: 1,
          printer_id: printerSelection?.printer_id ?? null,
          printer_profile_id:
            printerSelection?.printer_profile_id ?? label.printer_profile_id ?? null,
        },
        workstationId,
      ),
    [queuePrint, warehouseId],
  );

  const queueProductionBatchCard = useCallback(
    (
      batchId: number,
      warehouseIdOverride?: number | null,
      workstationId?: number | null,
      templateVersionId?: number | null,
    ) =>
      queuePrint(
        {
          document_type: "production_batch_card",
          document_id: batchId,
          warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
          template_version_id: templateVersionId ?? null,
          copies: 1,
        },
        workstationId,
      ),
    [queuePrint, warehouseId],
  );

  const queueProductionOrderCard = useCallback(
    (
      orderId: number,
      warehouseIdOverride?: number | null,
      workstationId?: number | null,
      templateVersionId?: number | null,
    ) =>
      queuePrint(
        {
          document_type: "production_order_card",
          document_id: orderId,
          warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
          template_version_id: templateVersionId ?? null,
          copies: 1,
        },
        workstationId,
      ),
    [queuePrint, warehouseId],
  );

  const queueProductionBatchMaterialPickList = useCallback(
    (
      batchId: number,
      warehouseIdOverride?: number | null,
      workstationId?: number | null,
      templateVersionId?: number | null,
    ) =>
      queuePrint(
        {
          document_type: "production_batch_material_pick_list",
          document_id: batchId,
          warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
          template_version_id: templateVersionId ?? null,
          copies: 1,
        },
        workstationId,
      ),
    [queuePrint, warehouseId],
  );

  const queueProductionOrderMaterialPickList = useCallback(
    (
      orderId: number,
      warehouseIdOverride?: number | null,
      workstationId?: number | null,
      templateVersionId?: number | null,
    ) =>
      queuePrint(
        {
          document_type: "production_order_material_pick_list",
          document_id: orderId,
          warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
          template_version_id: templateVersionId ?? null,
          copies: 1,
        },
        workstationId,
      ),
    [queuePrint, warehouseId],
  );

  return {
    busy,
    queuePrint,
    queueStockDocument,
    queueSaleDocument,
    queueLabelPrint,
    queueProductionBatchCard,
    queueProductionOrderCard,
    queueProductionBatchMaterialPickList,
    queueProductionOrderMaterialPickList,
  };
}

export { QUEUE_SUCCESS_MSG };
