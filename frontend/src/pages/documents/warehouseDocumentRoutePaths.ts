const WAREHOUSE_BASE = "/documents/warehouse";

const STOCK_TYPE_TO_SEGMENT: Record<string, string> = {
  PZ: "pz",
  WZ: "wz",
  MM: "mm",
  RW: "rw",
  PW: "pw",
  RK: "rk",
  ZD: "zd",
  ZW: "zw",
  Z_PZ: "z-pz",
  INW: "inw",
  RMZ: "rmz",
};

export function segmentFromStockDocumentType(documentType: string | null | undefined): string {
  const key = String(documentType || "pz")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  if (key === "PM") return "mm";
  return STOCK_TYPE_TO_SEGMENT[key] ?? key.toLowerCase().replace(/_/g, "-");
}

export function listPath(docSegment: string): string {
  const segment = String(docSegment ?? "").trim().toLowerCase();
  return `${WAREHOUSE_BASE}/${segment || "pz"}`;
}

export function detailPath(docSegment: string, documentId: number | string): string {
  const segment = String(docSegment ?? "").trim().toLowerCase();
  const id = String(documentId).trim();
  return `${WAREHOUSE_BASE}/${segment || "pz"}/${encodeURIComponent(id)}`;
}

/** Legacy query deep link: `/warehouse/pz?id=42` → `/warehouse/pz/42` */
export function legacyWarehouseDocumentRedirect(
  docSegment: string | undefined,
  searchParams: URLSearchParams,
): string | null {
  const raw = searchParams.get("id");
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (!docSegment?.trim()) return null;
  return detailPath(docSegment, id);
}
