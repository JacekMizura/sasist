import {
  detailPath,
  segmentFromStockDocumentType,
} from "../pages/documents/warehouseDocumentRoutePaths";

const WAREHOUSE_DOC_SEGMENTS: Record<string, string> = {
  PZ: "pz",
  WZ: "wz",
  MM: "mm",
  RW: "rw",
  PW: "pw",
  RK: "rk",
  ZD: "zd",
  ZW: "zw",
  Z_PZ: "z-pz",
};

export function warehouseStockDocumentPath(
  documentType: string | null | undefined,
  documentId: number,
): string {
  const key = String(documentType || "pz").trim().toUpperCase().replace(/-/g, "_");
  const segment = WAREHOUSE_DOC_SEGMENTS[key] ?? segmentFromStockDocumentType(documentType);
  if (key === "Z_PZ") {
    return `/documents/warehouse/z-pz?id=${documentId}`;
  }
  return detailPath(segment, documentId);
}

export { segmentFromStockDocumentType };
