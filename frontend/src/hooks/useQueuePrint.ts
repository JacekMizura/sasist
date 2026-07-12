import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import { queuePrintJob } from "../api/printingApi";
import { extractApiErrorMessage } from "../api/apiErrorMessage";
import type { QueuePrintRequest } from "../types/printing";

const QUEUE_SUCCESS_MSG = "Dokument został wysłany do kolejki drukowania";

type Options = {
  tenantId: number;
  warehouseId?: number | null;
};

export function useQueuePrint({ tenantId, warehouseId }: Options) {
  const [busy, setBusy] = useState(false);

  const queuePrint = useCallback(
    async (body: QueuePrintRequest) => {
      if (busy) return false;
      setBusy(true);
      try {
        await queuePrintJob(tenantId, {
          ...body,
          warehouse_id: body.warehouse_id ?? warehouseId ?? null,
        });
        toast.success(QUEUE_SUCCESS_MSG);
        return true;
      } catch (err) {
        toast.error(extractApiErrorMessage(err, "Nie udało się wysłać do drukowania."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, tenantId, warehouseId],
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
    ) =>
      queuePrint({
        document_type: "label",
        label,
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
  };
}

export { QUEUE_SUCCESS_MSG };
