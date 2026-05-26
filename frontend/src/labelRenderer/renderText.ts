/**
 * Renders a text layout item to an SVG fragment.
 * Coordinates in mm, local to element (0,0) with size width_mm x height_mm.
 * Caller wraps in transform for position and rotation (see svgRenderer.wrapElement).
 * Vertical centering matches PDF intent: middle uses box center + dominant-baseline="middle".
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";

/** Font size in user units (mm) for SVG font-size attribute. */
const POINTS_PER_MM = 2.83465;

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
  const fontSizePt = item.fontSize ?? 10;
  const fontSizeMm = fontSizePt / POINTS_PER_MM;
  const fontFamily = item.fontFamily ?? "sans-serif";
  const bold = item.bold ?? false;
  const color = item.textColor ?? "#000000";
  const align = item.horizontalAlign ?? "left";
  const vertAlign = item.verticalAlign ?? "middle";

  const textAnchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  const x = align === "center" ? w / 2 : align === "right" ? w : 0;

  let y: number;
  let dominantBaseline: string;
  if (vertAlign === "top") {
    y = fontSizeMm / 2;
    dominantBaseline = "middle";
  } else if (vertAlign === "bottom") {
    y = h - fontSizeMm / 2;
    dominantBaseline = "middle";
  } else {
    y = h / 2;
    dominantBaseline = "middle";
  }

  if (item.verticalText && text) {
    const yCenter = h / 2;
    const parts = text.split("").map((c, i) => {
      const dy = (i - (text.length - 1) / 2) * fontSizeMm * 0.6;
      return `<text x="${w / 2}" y="${yCenter + dy}" font-family="${escapeXml(fontFamily)}" font-size="${fontSizeMm}" font-weight="${bold ? "bold" : "normal"}" fill="${escapeXml(color)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(c)}</text>`;
    });
    return parts.join("");
  }

  return `<text x="${x}" y="${y}" font-family="${escapeXml(fontFamily)}" font-size="${fontSizeMm}" font-weight="${bold ? "bold" : "normal"}" fill="${escapeXml(color)}" text-anchor="${textAnchor}" dominant-baseline="${dominantBaseline}">${escapeXml(text)}</text>`;
}
