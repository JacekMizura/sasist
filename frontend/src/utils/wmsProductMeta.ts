export function parseProductMetadataJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw || !String(raw).trim()) return null;
  try {
    const data = JSON.parse(String(raw)) as unknown;
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function productCreatedInWms(metadataJson: string | Record<string, unknown> | null | undefined): boolean {
  const raw =
    metadataJson == null
      ? null
      : typeof metadataJson === "string"
        ? metadataJson
        : JSON.stringify(metadataJson);
  const meta = parseProductMetadataJson(raw);
  if (!meta) return false;
  const src = String(meta.creation_source ?? "").trim().toUpperCase();
  return src === "WMS_RECEIVING" || meta.is_incomplete === true;
}
