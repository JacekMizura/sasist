/** Mirrors backend ``doc_allows_wms_putaway`` — keep list + detail in sync. */

export function normalizeDocType(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

export function normalizeDocStatus(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

export function isReturnReceiptDocumentType(documentType: string | null | undefined): boolean {
  const dt = normalizeDocType(documentType);
  return dt === "Z_PZ" || dt === "PZ_RT" || dt === "RETURN_RECEIPT";
}

export function docAllowsWmsPutaway(
  documentType: string | null | undefined,
  status: string | null | undefined,
): boolean {
  const dt = normalizeDocType(documentType);
  const st = normalizeDocStatus(status);
  if (dt === "MM") return st === "DRAFT";
  if (isReturnReceiptDocumentType(dt)) {
    return st === "DRAFT" || st === "OPEN" || st === "CLOSED" || st === "POSTED" || st === "ZAKONCZONE";
  }
  if (dt === "PZ") return st === "DRAFT" || st === "POSTED" || st === "ZAKONCZONE";
  return false;
}

export function putawayRelocationOpen(relocationStatus: string | null | undefined): boolean {
  return normalizeDocStatus(relocationStatus || "OPEN") !== "DONE";
}

export function putawayCardsEnabled(
  documentType: string | null | undefined,
  status: string | null | undefined,
  relocationStatus: string | null | undefined,
): boolean {
  return docAllowsWmsPutaway(documentType, status) && putawayRelocationOpen(relocationStatus);
}
