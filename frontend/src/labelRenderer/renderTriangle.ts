/**
 * Renders a triangle layout item to an SVG fragment.
 * Variant controls which corner has the right angle.
 * Uses absolute coordinates in mm within the element box.
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

export function renderTriangle(item: LayoutItem): string {
  if (item.type !== "triangle") return "";

  const w = item.width_mm;
  const h = item.height_mm;
  const variant = (item.variant ?? "topLeft").toString();

  let points: string;
  switch (variant) {
    case "topRight":
      points = `0,0 ${w},0 ${w},${h}`;
      break;
    case "bottomLeft":
      points = `0,0 ${w},${h} 0,${h}`;
      break;
    case "bottomRight":
      points = `${w},0 ${w},${h} 0,${h}`;
      break;
    case "topLeft":
    default:
      points = `0,0 ${w},0 0,${h}`;
      break;
  }

  const fill = item.fill ?? item.backgroundColor ?? "none";
  const stroke = item.borderColor ?? item.textColor ?? "#000000";
  const strokeWidth = item.strokeWidth ?? 0.5;

  return `<polygon points="${escapeAttr(points)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(
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

