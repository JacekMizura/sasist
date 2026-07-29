import { createPrintJobFromPayload } from "../../api/printingApi";
import { openPdfBlobInPrintViewer } from "../../utils/openPdfForBrowserPrint";
import { downloadPdfBlob } from "../../components/printing/downloadPdfBlob";
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

export type ExecutePdfLabelPrintInput = ResolvePrintRouteInput & {
  /** Pre-rendered label PDF. */
  pdf: ArrayBuffer | Blob;
  /** Force transport (conscious dialog selection only). */
  forceTransport?: PrintRouteDecision["transport"];
  fileName?: string;
};

/**
 * Single entry for PDF label prints (Z-PZ, return labels, LabelPrintQueue emergency paths).
 * No silent QZ / browser auto-fallback — Agent failure surfaces as an error.
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
      trackFallbackReason("no_workstation_mapping");
      throw new Error(
        "Brak mapowania drukarki na stanowisku. Skonfiguruj mapowanie w Ustawienia WMS → Stanowiska.",
      );
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
    } catch (err) {
      trackFallbackReason("agent_error");
      throw err instanceof Error
        ? err
        : new Error("Nie udało się wysłać etykiety do kolejki drukowania.");
    }
  }

  // QZ is DEV-only via PrintMethodDialog — never auto-selected here.
  trackFallbackReason("unsupported_capability");
  throw new Error("Wydruk Agent niedostępny. Wybierz metodę w oknie drukowania.");
}

export const PrintingRouter = {
  resolve: resolvePrintRoute,
  executePdfLabelPrint,
};
