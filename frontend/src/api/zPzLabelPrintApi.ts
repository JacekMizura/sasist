import api from "./axios";
import type { Printer } from "../types/printer";
import { connectQZ, isQzAvailable, printPdf, setQzSecurity } from "../printing/qzService";
import { openPdfBlobInPrintViewer } from "../utils/openPdfForBrowserPrint";

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

/** POST /api/labels/print/z-pz → PDF, then QZ or browser print fallback. */
export async function printZPzLabel(
  stockDocumentId: number,
  templateId: number,
  tenantId: number,
): Promise<void> {
  const res = await api.post<ArrayBuffer>(
    "labels/print/z-pz",
    { stock_document_id: stockDocumentId, template_id: templateId },
    { responseType: "arraybuffer", params: { tenant_id: tenantId } },
  );
  const buf = res.data as unknown as ArrayBuffer;
  const blob = new Blob([buf], { type: "application/pdf" });

  if (!isQzAvailable()) {
    openPdfBlobInPrintViewer(blob, { revokeBlobUrlsAfterMs: 120_000 });
    return;
  }

  setQzSecurity((toSign: string) =>
    api.get<{ signature: string }>("/qz/sign", { params: { request: toSign } }).then((r) => r.data.signature),
  );
  await connectQZ();
  const pdfBase64 = arrayBufferToBase64(buf);

  const printersRes = await api.get<Printer[]>("/printers", { params: { tenant_id: tenantId } });
  const list = Array.isArray(printersRes.data) ? printersRes.data : [];
  const mapped = list.find((p) => p.system_printer_name != null && String(p.system_printer_name).trim() !== "");
  const name = mapped?.system_printer_name?.trim();
  if (!name) {
    openPdfBlobInPrintViewer(blob, { revokeBlobUrlsAfterMs: 120_000 });
    return;
  }

  await printPdf(name, pdfBase64);
}
