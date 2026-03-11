/**
 * Renders a text layout item to an SVG fragment.
 * Coordinates in mm, local to element (0,0) with size width_mm x height_mm.
 * Caller wraps in transform for position and rotation.
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderText(item: LayoutItem): string {
  if (item.type !== "text") return "";
  const w = item.width_mm;
  const h = item.height_mm;
  const text = item.text ?? "";
  const fontSizeMm = (item.fontSize ?? 10) * 0.35; // pt to approximate mm
  const fontFamily = item.fontFamily ?? "sans-serif";
  const bold = item.bold ?? false;
  const color = item.textColor ?? "#000000";
  const align = item.horizontalAlign ?? "left";
  const vertAlign = item.verticalAlign ?? "middle";

  const textAnchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const x = align === "center" ? w / 2 : align === "right" ? w : 0;
  let y: number;
  if (vertAlign === "top") y = fontSizeMm * 0.6;
  else if (vertAlign === "bottom") y = h - fontSizeMm * 0.6;
  else y = h / 2;

  if (item.verticalText && text) {
    const parts = text.split("").map((c, i) => {
      const dy = (i - (text.length - 1) / 2) * fontSizeMm * 0.6;
      return `<text x="${w / 2}" y="${y + dy}" font-family="${escapeXml(fontFamily)}" font-size="${fontSizeMm}" font-weight="${bold ? "bold" : "normal"}" fill="${escapeXml(color)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(c)}</text>`;
    });
    return parts.join("");
  }

  return `<text x="${x}" y="${y}" font-family="${escapeXml(fontFamily)}" font-size="${fontSizeMm}" font-weight="${bold ? "bold" : "normal"}" fill="${escapeXml(color)}" text-anchor="${textAnchor}" dominant-baseline="middle">${escapeXml(text)}</text>`;
}
