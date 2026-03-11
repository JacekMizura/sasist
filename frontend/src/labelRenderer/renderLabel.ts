/**
 * Single shared label renderer. Returns a complete SVG string for the label.
 * Used by editor preview and PDF generator so layout is identical.
 * All coordinates in mm, top-left origin.
 */
import type { LabelTemplate } from "../types/labelSystem";
import type { LabelRecord } from "../types/labelSystem";
import { computeLayoutFromTemplate } from "../utils/labelLayoutEngine";
import type { LayoutItem } from "../utils/labelLayoutEngine";
import { renderText } from "./renderText";
import { renderBarcode } from "./renderBarcode";
import { renderRectangle } from "./renderRectangle";
import { renderArrow } from "./renderArrow";

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

function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

/**
 * Renders a full label as an SVG string. Uses template + data to compute layout and draw all elements.
 * Elements are sorted by zIndex (higher = on top) before layout so render order matches layering.
 * Coordinates in mm. Use viewBox to scale in the editor or when embedding in PDF.
 */
export async function renderLabel(
  template: LabelTemplate,
  data: LabelRecord | Record<string, unknown>
): Promise<string> {
  const sortedElements = [...template.elements].sort(
    (a, b) => ((a as { zIndex?: number }).zIndex ?? 0) - ((b as { zIndex?: number }).zIndex ?? 0)
  );
  const sortedTemplate = { ...template, elements: sortedElements };
  const items = computeLayoutFromTemplate(sortedTemplate, data as LabelRecord);
  const widthMm = template.widthMm;
  const heightMm = template.heightMm;

  const fragments = await Promise.all(items.map(renderElement));
  const body = fragments.join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}" height="${heightMm}" viewBox="0 0 ${widthMm} ${heightMm}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}
