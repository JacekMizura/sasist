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
  creationSource?: string | null,
): boolean {
  const dt = normalizeDocType(documentType);
  const st = normalizeDocStatus(status);
  const src = String(creationSource ?? "").trim().toUpperCase();
  if (dt === "MM") return st === "DRAFT";
  if (isReturnReceiptDocumentType(dt)) {
    return st === "DRAFT" || st === "OPEN" || st === "CLOSED" || st === "POSTED" || st === "ZAKONCZONE";
  }
  if (dt === "PZ") return st === "DRAFT" || st === "POSTED" || st === "ZAKONCZONE";
  if (dt === "PW" && src === "PRODUCTION") {
    return st === "DRAFT" || st === "POSTED" || st === "ZAKONCZONE" || st === "COMPLETED";
  }
  return false;
}

export function putawayRelocationOpen(relocationStatus: string | null | undefined): boolean {
  return normalizeDocStatus(relocationStatus || "OPEN") !== "DONE";
}

export function putawayCardsEnabled(
  documentType: string | null | undefined,
  status: string | null | undefined,
  relocationStatus: string | null | undefined,
  creationSource?: string | null,
): boolean {
  return (
    docAllowsWmsPutaway(documentType, status, creationSource) &&
    putawayRelocationOpen(relocationStatus)
  );
}

/** Prefer backend SSOT `can_wms_putaway` when present on document reads. */
export function documentCanWmsPutaway(doc: {
  can_wms_putaway?: boolean | null;
  document_type?: string | null;
  status?: string | null;
  relocation_status?: string | null;
  creation_source?: string | null;
}): boolean {
  if (typeof doc.can_wms_putaway === "boolean") return doc.can_wms_putaway;
  return putawayCardsEnabled(
    doc.document_type,
    doc.status,
    doc.relocation_status,
    doc.creation_source,
  );
}
