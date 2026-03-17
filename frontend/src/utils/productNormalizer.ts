/**
 * Normalizes product dimensions from API responses to a single frontend convention.
 * API may send: length, width, height or length_cm, width_cm, height_cm, depth_cm (flat or under p.dimensions).
 * Frontend standard: width_cm, depth_cm, height_cm (depth = length).
 * Coerces to number so string values from JSON are handled.
 */
export function normalizeProductDims(p: any): { width_cm: number; depth_cm: number; height_cm: number } {
  if (p == null) return { width_cm: 0, depth_cm: 0, height_cm: 0 };
  const num = (v: unknown): number => {
    const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(x) && x >= 0 ? x : 0;
  };
  const d = p.dimensions && typeof p.dimensions === "object" ? p.dimensions : p;
  return {
    width_cm: num(d.width_cm ?? d.width ?? 0),
    depth_cm: num(d.depth_cm ?? d.length_cm ?? d.length ?? 0),
    height_cm: num(d.height_cm ?? d.height ?? 0),
  };
}
