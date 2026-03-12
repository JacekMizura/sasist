/**
 * Entry point: template + record → layout → renderer → output string.
 * Used by editor preview and PDF generator. Default renderer is SVG.
 * All coordinates in mm, top-left origin.
 */
import type { LabelTemplate } from "../types/labelSystem";
import type { LabelRecord } from "../types/labelSystem";
import { computeLayoutFromTemplate } from "../utils/labelLayoutEngine";
import type { LabelRenderer } from "./renderer";
import { svgRenderer } from "./svgRenderer";

/**
 * Renders a full label. Uses template + data to compute layout, then the given renderer (default SVG).
 * Elements are sorted by zIndex (higher = on top) before layout so render order matches layering.
 * Existing calls renderLabel(template, record) continue to return SVG exactly as before.
 */
export async function renderLabel(
  template: LabelTemplate,
  data: LabelRecord | Record<string, unknown>,
  renderer?: LabelRenderer
): Promise<string> {
  const sortedElements = [...template.elements].sort(
    (a, b) => ((a as { zIndex?: number }).zIndex ?? 0) - ((b as { zIndex?: number }).zIndex ?? 0)
  );
  const sortedTemplate = { ...template, elements: sortedElements };
  const items = computeLayoutFromTemplate(sortedTemplate, data as LabelRecord);
  const widthMm = template.widthMm;
  const heightMm = template.heightMm;

  const r = renderer ?? svgRenderer;
  const result = r.render(items, { widthMm, heightMm });
  return typeof result === "string" ? Promise.resolve(result) : result;
}
