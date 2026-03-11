/**
 * Renders a rectangle (rect) layout item to an SVG fragment.
 * Coordinates in mm, local to element (0,0) with size width_mm x height_mm.
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

export function renderRectangle(item: LayoutItem): string {
  if (item.type !== "rect") return "";
  const w = item.width_mm;
  const h = item.height_mm;
  const strokeWidth = (item.strokeWidth ?? 0.5);
  const fill = item.fill ?? item.backgroundColor ?? "none";
  const stroke = item.borderColor ?? item.textColor ?? "#000000";

  return `<rect x="0" y="0" width="${w}" height="${h}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"/>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
