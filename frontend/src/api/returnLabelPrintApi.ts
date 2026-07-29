/**
 * Return label print — routed via PrintingRouter (Agent / browser / download).
 */
import api from "./axios";
import { executePdfLabelPrint } from "../printing/router";
import type { PrintRouteDecision } from "../printing/router/types";

type PrintReturnLabelOpts = {
  forceTransport?: PrintRouteDecision["transport"];
};

/**
 * POST /api/labels/print/return → PDF, then PrintingRouter selects transport.
 */
export async function printReturnLabel(
  returnLineId: number,
  tenantId: number,
  warehouseId?: number | null,
  workstationId?: number | null,
  opts?: PrintReturnLabelOpts,
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
    forceTransport: opts?.forceTransport,
  });
}
