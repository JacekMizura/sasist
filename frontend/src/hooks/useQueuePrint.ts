import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import { queuePrintJob } from "../api/printingApi";
import { extractApiErrorMessage, extractApiOperationalErrorDetail } from "../api/apiErrorMessage";
import { useAuth } from "../context/AuthContext";
import type { QueuePrintRequest } from "../types/printing";
import { NO_ACTIVE_AGENT_USER_MESSAGE } from "../components/printing/hasDefaultCloudPrinter";

const QUEUE_SUCCESS_MSG = "Dokument został wysłany do kolejki drukowania";

type Options = {
  tenantId: number;
  warehouseId?: number | null;
  /** Explicit WMS Stanowisko; overrides session packing_station_id when set. */
  workstationId?: number | null;
};

function queueFailureMessage(err: unknown): string {
  const op = extractApiOperationalErrorDetail(err);
  if (op?.code === "NO_ACTIVE_AGENT" || op?.code === "AGENT_OFFLINE") {
    return op.code === "NO_ACTIVE_AGENT" ? NO_ACTIVE_AGENT_USER_MESSAGE : op.message;
  }
  if (op?.message) return op.message;
  return extractApiErrorMessage(err, "Nie udało się wysłać do drukowania.");
}

function resolveWorkstationId(
  explicit: number | null | undefined,
  fromSession: number | null | undefined,
  fromBody: number | null | undefined,
): number | null {
  for (const value of [fromBody, explicit, fromSession]) {
    if (value != null && Number.isFinite(Number(value)) && Number(value) >= 1) {
      return Math.floor(Number(value));
    }
  }
  return null;
}

export function useQueuePrint({ tenantId, warehouseId, workstationId }: Options) {
  const { user } = useAuth();
  const sessionWorkstationId = user?.wms_profile?.packing_station_id ?? null;
  const [busy, setBusy] = useState(false);

  const queuePrint = useCallback(
    async (body: QueuePrintRequest) => {
      if (busy) return false;
      setBusy(true);
      try {
        const workstation_id = resolveWorkstationId(
          workstationId,
          sessionWorkstationId,
          body.workstation_id,
        );
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
    [busy, tenantId, warehouseId, workstationId, sessionWorkstationId],
  );

  const queueStockDocument = useCallback(
    (documentId: number, warehouseIdOverride?: number | null) =>
      queuePrint({
        document_type: "stock_document",
        document_id: documentId,
        warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
        copies: 1,
      }),
    [queuePrint, warehouseId],
  );

  const queueSaleDocument = useCallback(
    (documentId: string, warehouseIdOverride?: number | null) =>
      queuePrint({
        document_type: "sale_document",
        document_id_str: documentId,
        warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
        copies: 1,
      }),
    [queuePrint, warehouseId],
  );

  const queueLabelPrint = useCallback(
    (
      label: NonNullable<QueuePrintRequest["label"]>,
      warehouseIdOverride?: number | null,
      printerSelection?: Pick<QueuePrintRequest, "printer_id" | "printer_profile_id">,
    ) =>
      queuePrint({
        document_type: "label",
        label,
        warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
        copies: 1,
        printer_id: printerSelection?.printer_id ?? null,
        printer_profile_id:
          printerSelection?.printer_profile_id ?? label.printer_profile_id ?? null,
      }),
    [queuePrint, warehouseId],
  );

  const queueProductionBatchCard = useCallback(
    (batchId: number, warehouseIdOverride?: number | null) =>
      queuePrint({
        document_type: "production_batch_card",
        document_id: batchId,
        warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
        copies: 1,
      }),
    [queuePrint, warehouseId],
  );

  const queueProductionOrderCard = useCallback(
    (orderId: number, warehouseIdOverride?: number | null) =>
      queuePrint({
        document_type: "production_order_card",
        document_id: orderId,
        warehouse_id: warehouseIdOverride ?? warehouseId ?? null,
        copies: 1,
      }),
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
  };
}

export { QUEUE_SUCCESS_MSG };
