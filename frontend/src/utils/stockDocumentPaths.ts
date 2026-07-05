const WAREHOUSE_DOC_SEGMENTS: Record<string, string> = {
  PZ: "pz",
  WZ: "wz",
  MM: "mm",
  RW: "rw",
  PW: "pw",
  RK: "rk",
};

export function warehouseStockDocumentPath(
  documentType: string | null | undefined,
  documentId: number,
): string {
  const key = String(documentType || "pz").trim().toUpperCase();
  const segment = WAREHOUSE_DOC_SEGMENTS[key] ?? key.toLowerCase();
  return `/documents/warehouse/${segment}?id=${documentId}`;
}
