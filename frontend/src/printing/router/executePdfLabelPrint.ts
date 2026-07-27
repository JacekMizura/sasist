import api from "../../api/axios";
import { createPrintJobFromPayload } from "../../api/printingApi";
import type { Printer } from "../../types/printer";
import { openPdfBlobInPrintViewer } from "../../utils/openPdfForBrowserPrint";
import { downloadPdfBlob } from "../../components/printing/downloadPdfBlob";
import { connectQZ, isQzAvailable, printPdf, setQzSecurity } from "../qzService";
import { resolvePrintRoute } from "./resolvePrintRoute";
import { trackFallbackReason, trackPrintedVia } from "./telemetry";
import type { PrintRouteDecision, ResolvePrintRouteInput } from "./types";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))) as unknown as number[],
    );
  }
  return btoa(binary);
}

async function printViaQz(pdfBase64: string, tenantId: number, blob: Blob): Promise<void> {
  // Stage 5 Cleanup: remove QZ Tray path after full cutover.
  if (!isQzAvailable()) {
    openPdfBlobInPrintViewer(blob, { revokeBlobUrlsAfterMs: 120_000 });
    trackPrintedVia("browser");
    trackFallbackReason("qz_unavailable");
    return;
  }
  setQzSecurity((toSign: string) =>
    api.get<{ signature: string }>("/qz/sign", { params: { request: toSign } }).then((r) => r.data.signature),
  );
  await connectQZ();
  const printersRes = await api.get<Printer[]>("/printers", { params: { tenant_id: tenantId } });
  const list = Array.isArray(printersRes.data) ? printersRes.data : [];
  const mapped = list.find((p) => p.system_printer_name != null && String(p.system_printer_name).trim() !== "");
  const name = mapped?.system_printer_name?.trim();
  if (!name) {
    openPdfBlobInPrintViewer(blob, { revokeBlobUrlsAfterMs: 120_000 });
    trackPrintedVia("browser");
    trackFallbackReason("no_default_printer");
    return;
  }
  await printPdf(name, pdfBase64);
  trackPrintedVia("qz");
}

export type ExecutePdfLabelPrintInput = ResolvePrintRouteInput & {
  /** Pre-rendered label PDF. */
  pdf: ArrayBuffer | Blob;
  /** Force transport (dialog selection). */
  forceTransport?: PrintRouteDecision["transport"];
  fileName?: string;
};

/**
 * Single entry for PDF label prints (Z-PZ, return labels, LabelPrintQueue emergency paths).
 * Application code should call this instead of qzService / queue directly.
 */
export async function executePdfLabelPrint(input: ExecutePdfLabelPrintInput): Promise<PrintRouteDecision> {
  const blob =
    input.pdf instanceof Blob ? input.pdf : new Blob([input.pdf], { type: "application/pdf" });
  const buffer =
    input.pdf instanceof ArrayBuffer ? input.pdf : await blob.arrayBuffer();

  let decision = await resolvePrintRoute(input);
  if (input.forceTransport) {
    decision = { ...decision, transport: input.forceTransport };
  }

  if (decision.transport === "download") {
    downloadPdfBlob(blob, input.fileName ?? "label.pdf");
    trackPrintedVia("download");
    return decision;
  }

  if (decision.transport === "browser") {
    openPdfBlobInPrintViewer(blob, { revokeBlobUrlsAfterMs: 120_000 });
    trackPrintedVia("browser");
    if (decision.fallbackReason) trackFallbackReason(decision.fallbackReason);
    return decision;
  }

  if (decision.transport === "agent") {
    if (decision.printerId == null) {
      trackFallbackReason("no_default_printer");
      await printViaQz(arrayBufferToBase64(buffer), input.tenantId, blob);
      return { ...decision, transport: "qz", fallbackReason: "no_default_printer" };
    }
    try {
      await createPrintJobFromPayload(input.tenantId, {
        printer_id: decision.printerId,
        document_type: "label",
        warehouse_id: input.warehouseId ?? null,
        payload: {
          format: decision.jobFormat,
          content_base64: arrayBufferToBase64(buffer),
          copies: 1,
        },
      });
      trackPrintedVia("agent");
      return decision;
    } catch {
      trackFallbackReason("agent_error");
      await printViaQz(arrayBufferToBase64(buffer), input.tenantId, blob);
      return { ...decision, transport: "qz", fallbackReason: "agent_error" };
    }
  }

  // qz (legacy / rollback)
  await printViaQz(arrayBufferToBase64(buffer), input.tenantId, blob);
  return decision;
}

export const PrintingRouter = {
  resolve: resolvePrintRoute,
  executePdfLabelPrint,
};
