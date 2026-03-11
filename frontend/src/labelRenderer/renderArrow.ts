/**
 * Renders an arrow layout item to an SVG fragment.
 * Matches PDF: line stem + polygon arrowhead. Respects width, height, direction, rotation (handled by wrapper).
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

export function renderArrow(item: LayoutItem): string {
  if (item.type !== "arrow") return "";
  const w = item.width_mm;
  const h = item.height_mm;
  const dir = (item.direction ?? "right").toLowerCase();
  const cx = w / 2;
  const cy = h / 2;
  const head = Math.min(w, h) * 0.4;
  const strokeWidth = Math.max(0.5, item.strokeWidth ?? 1);
  const stroke = item.borderColor ?? item.textColor ?? "#000000";
  const fill = item.backgroundColor ?? item.textColor ?? stroke;

  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"/>`;
  const triangle = (pts: string) =>
    `<polygon points="${pts}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${strokeWidth}"/>`;

  let content: string;
  if (dir === "right") {
    content = line(0, cy, w - head, cy) + triangle(`${w},${cy} ${w - head},${cy - head * 0.7} ${w - head},${cy + head * 0.7}`);
  } else if (dir === "left") {
    content = line(head, cy, w, cy) + triangle(`0,${cy} ${head},${cy - head * 0.7} ${head},${cy + head * 0.7}`);
  } else if (dir === "up") {
    content = line(cx, head, cx, h - head) + triangle(`${cx},${h} ${cx - head * 0.7},${h - head} ${cx + head * 0.7},${h - head}`);
  } else {
    content = line(cx, h - head, cx, head) + triangle(`${cx},0 ${cx - head * 0.7},${head} ${cx + head * 0.7},${head}`);
  }
  return content;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
