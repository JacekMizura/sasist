/**
 * Z-PZ label print — routed via PrintingRouter (Agent / browser / download).
 */
import api from "./axios";
import { executePdfLabelPrint } from "../printing/router";
import type { PrintRouteDecision } from "../printing/router/types";

type PrintZPzLabelOpts = {
  forceTransport?: PrintRouteDecision["transport"];
};

/** POST /api/labels/print/z-pz → PDF, then PrintingRouter selects transport. */
export async function printZPzLabel(
  stockDocumentId: number,
  templateId: number,
  tenantId: number,
  warehouseId?: number | null,
  workstationId?: number | null,
  opts?: PrintZPzLabelOpts,
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
    forceTransport: opts?.forceTransport,
  });
}
