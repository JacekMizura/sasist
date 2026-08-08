import {
  getWmsPackingReplacementLabelByBarcode,
  postWmsPackingReplacementLabel,
  postWmsPackingReplacementLabelRetry,
  wmsPackingApiErrorCode,
  wmsPackingApiErrorMessage,
  type WmsPackingPostPackStepApi,
  type WmsPackingReplacementLabelApi,
  type WmsPackingReplacementLabelRetryApi,
} from "../../../api/wmsPackingApi";
import { openPdfBlobInPrintViewer } from "../../../utils/openPdfForBrowserPrint";

export const REPLACEMENT_LABEL_BARCODE_PREFIX = "RPL-";

export function isReplacementLabelBarcode(raw: string): boolean {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .startsWith(REPLACEMENT_LABEL_BARCODE_PREFIX);
}

export function findReplacementOfferStep(
  pipeline: WmsPackingPostPackStepApi[] | null | undefined,
): WmsPackingPostPackStepApi | null {
  if (!pipeline?.length) return null;
  return pipeline.find((s) => s.offer_replacement_label === true && s.ok === false) ?? null;
}

export function openReplacementLabelPdf(pdfBase64: string | null | undefined): void {
  const b64 = String(pdfBase64 || "").trim();
  if (!b64) return;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    openPdfBlobInPrintViewer(blob, { autoPrint: true, revokeBlobUrlsAfterMs: 120_000 });
  } catch {
    /* soft-fail print */
  }
}

export async function createAndPrintReplacementLabel(opts: {
  tenantId: number;
  warehouseId: number;
  orderId: number;
  courierError?: string | null;
}): Promise<WmsPackingReplacementLabelApi> {
  const row = await postWmsPackingReplacementLabel(
    opts.tenantId,
    opts.warehouseId,
    opts.orderId,
    opts.courierError,
  );
  openReplacementLabelPdf(row.pdf_base64);
  return row;
}

export type ReplacementScanResult =
  | { ok: true; orderId: number; retry: WmsPackingReplacementLabelRetryApi; label: WmsPackingReplacementLabelApi }
  | { ok: false; message: string; code?: string | null; orderId?: number };

/**
 * Resolve RPL barcode → restore packing snapshot → retry courier label.
 */
export async function handleReplacementLabelScan(opts: {
  tenantId: number;
  warehouseId: number;
  barcode: string;
}): Promise<ReplacementScanResult> {
  try {
    const label = await getWmsPackingReplacementLabelByBarcode(opts.tenantId, opts.barcode);
    if (label.status === "courier_generated") {
      return {
        ok: true,
        orderId: label.order_id,
        label,
        retry: {
          ok: true,
          status: label.status,
          message: "courier_already_generated",
          order_id: label.order_id,
          replacement_label_id: label.id,
          barcode: label.barcode,
        },
      };
    }
    const retry = await postWmsPackingReplacementLabelRetry(
      opts.tenantId,
      opts.warehouseId,
      label.id,
    );
    if (retry.ok) {
      return { ok: true, orderId: retry.order_id, retry, label };
    }
    return {
      ok: false,
      orderId: retry.order_id,
      message:
        retry.message ||
        "Nie udało się ponownie wygenerować etykiety kurierskiej. Stan etykiety zastępczej zachowany.",
      code: "regenerate_failed",
    };
  } catch (e) {
    const code = wmsPackingApiErrorCode(e);
    const msg = wmsPackingApiErrorMessage(e);
    if (code === "replacement_template_not_configured") {
      return { ok: false, code, message: msg || "Nie skonfigurowano szablonu etykiety zastępczej." };
    }
    return {
      ok: false,
      code,
      message: msg || "Nie znaleziono etykiety zastępczej dla tego kodu.",
    };
  }
}
