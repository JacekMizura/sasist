/**
 * SVG renderer: turns LayoutItem[] into a complete SVG string.
 * Used by editor preview and PDF so layout is identical.
 * All coordinates in mm, top-left origin.
 */
import type { LayoutItem } from "../utils/labelLayoutEngine";
import type { LabelRenderer, LabelRendererOptions } from "./renderer";
import { renderText } from "./renderText";
import { renderBarcode } from "./renderBarcode";
import { renderRectangle } from "./renderRectangle";
import { renderArrow } from "./renderArrow";
import { renderImage } from "./renderImage";
import { renderIcon } from "./renderIcon";
import { renderTriangle } from "./renderTriangle";
import { renderPolygon } from "./renderPolygon";

function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapElement(fragment: string, item: LayoutItem): string {
  if (!fragment) return "";
  const x = item.x_mm;
  const y = item.y_mm;
  const w = item.width_mm;
  const h = item.height_mm;
  const rot = typeof item.rotation === "number" ? item.rotation : 0;
  const cx = w / 2;
  const cy = h / 2;
  const transform = rot
    ? `translate(${x},${y}) rotate(${-rot},${cx},${cy})`
    : `translate(${x},${y})`;
  return `<g transform="${transform}" data-id="${escapeAttr(item.id)}">${fragment}</g>`;
}

async function renderElement(item: LayoutItem): Promise<string> {
  let fragment: string;
  switch (item.type) {
    case "text":
      fragment = renderText(item);
      break;
    case "barcode":
      fragment = await renderBarcode(item);
      break;
    case "rect":
      fragment = renderRectangle(item);
      break;
    case "arrow":
      fragment = renderArrow(item);
      break;
    case "image":
      fragment = renderImage(item);
      break;
    case "icon":
      fragment = renderIcon(item);
      break;
    case "triangle":
      fragment = renderTriangle(item);
      break;
    case "polygon":
      fragment = renderPolygon(item);
      break;
    case "line": {
      const w = item.width_mm;
      const h = item.height_mm;
      const sw = item.strokeWidth ?? 0.5;
      const stroke = item.borderColor ?? item.textColor ?? "#000000";
      fragment = `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${escapeAttr(stroke)}" stroke-width="${sw}"/>`;
      break;
    }
    case "section": {
      const w = item.width_mm;
      const h = item.height_mm;
      const sw = item.borderWidth ?? 0.5;
      const fill = item.backgroundColor ?? "#e5e7eb";
      const stroke = item.borderColor ?? item.textColor ?? "#374151";
      fragment = `<rect x="0" y="0" width="${w}" height="${h}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${sw}"/>`;
      break;
    }
    default:
      fragment = "";
  }
  return wrapElement(fragment, item);
}

export const svgRenderer: LabelRenderer = {
  async render(items: LayoutItem[], options: LabelRendererOptions): Promise<string> {
    const { widthMm, heightMm } = options;
    const fragments = await Promise.all(items.map(renderElement));
    const body = fragments.join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}" height="${heightMm}" viewBox="0 0 ${widthMm} ${heightMm}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
  },
};
