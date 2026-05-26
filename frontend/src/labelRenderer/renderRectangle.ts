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
  const rawFill = item.fill ?? item.backgroundColor ?? "none";
  const fill = rawFill === "none" || rawFill === undefined || rawFill === "" ? "#ffffff" : rawFill;
  const stroke = item.borderColor ?? item.textColor ?? "#000000";
  const rawR =
    typeof item.cornerRadius_mm === "number" && Number.isFinite(item.cornerRadius_mm) ? item.cornerRadius_mm : 0;
  const capR = Math.min(w, h) / 2;
  const r = Math.max(0, Math.min(rawR, capR));
  const rxRy = r > 0 ? ` rx="${r}" ry="${r}"` : "";

  return `<rect x="0" y="0" width="${w}" height="${h}"${rxRy} fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"/>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
