/**
 * Renders a polygon layout item to an SVG fragment.
 * Points are already relative to the element box.
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

export function renderPolygon(item: LayoutItem): string {
  if (item.type !== "polygon" || !item.points) return "";

  const fill = item.fill ?? "none";
  const stroke = item.borderColor ?? item.textColor ?? "#000000";
  const strokeWidth = item.strokeWidth ?? 0.5;

  return `<polygon points="${escapeAttr(item.points)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(
    stroke
  )}" stroke-width="${strokeWidth}"/>`;
}

function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

