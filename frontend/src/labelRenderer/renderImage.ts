/**
 * Renders an image layout item to an SVG fragment.
 * Coordinates in mm, local to element (0,0) with size width_mm x height_mm.
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

export function renderImage(item: LayoutItem): string {
  if (item.type !== "image" || !item.src) return "";
  const w = item.width_mm;
  const h = item.height_mm;

  return `<image href="${escapeAttr(item.src)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
}

function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

