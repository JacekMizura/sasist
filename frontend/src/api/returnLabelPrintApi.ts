/**
 * Return label print — routed via PrintingRouter (Agent / QZ legacy / browser).
 * Stage 5 Cleanup: remove QZ knowledge from this module (router owns transports).
 */
import api from "./axios";
import { executePdfLabelPrint } from "../printing/router";

/**
 * POST /api/labels/print/return → PDF, then PrintingRouter selects transport.
 */
export async function printReturnLabel(
  returnLineId: number,
  tenantId: number,
  warehouseId?: number | null,
  workstationId?: number | null,
): Promise<void> {
  const res = await api.post<ArrayBuffer>(
    "labels/print/return",
    { return_line_id: returnLineId, template_type: "RETURN" },
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
    fileName: `return-${returnLineId}.pdf`,
  });
}
