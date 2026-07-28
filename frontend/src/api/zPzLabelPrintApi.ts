/**
 * Z-PZ label print — routed via PrintingRouter (Agent / QZ legacy / browser).
 * Stage 5 Cleanup: remove QZ knowledge from this module (router owns transports).
 */
import api from "./axios";
import { executePdfLabelPrint } from "../printing/router";

/** POST /api/labels/print/z-pz → PDF, then PrintingRouter selects transport. */
export async function printZPzLabel(
  stockDocumentId: number,
  templateId: number,
  tenantId: number,
  warehouseId?: number | null,
  workstationId?: number | null,
): Promise<void> {
  const res = await api.post<ArrayBuffer>(
    "labels/print/z-pz",
    { stock_document_id: stockDocumentId, template_id: templateId },
    { responseType: "arraybuffer", params: { tenant_id: tenantId } },
  );
  const buf = res.data as unknown as ArrayBuffer;
  await executePdfLabelPrint({
    tenantId,
    warehouseId: warehouseId ?? null,
    workstationId: workstationId ?? null,
    pdf: buf,
    gateFormat: "zpl",
    jobFormat: "pdf",
    printerKind: "label",
    fileName: `z-pz-${stockDocumentId}.pdf`,
  });
}
