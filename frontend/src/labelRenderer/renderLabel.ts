/**
 * Entry point: template + record → layout → renderer → output string.
 * Used by editor preview and PDF generator. Default renderer is SVG.
 * All coordinates in mm, top-left origin.
 * SVG text centering in the element box: renderText.ts (not computeLayoutFromTemplate).
 */
import { log } from "../utils/logger";
import type { LabelTemplate } from "../types/labelSystem";
import type { LabelRecord } from "../types/labelSystem";
import { computeLayoutFromTemplate, type ComputeLayoutOptions } from "../utils/labelLayoutEngine";
import type { LabelRenderer } from "./renderer";
import { svgRenderer } from "./svgRenderer";
import { applyThermalMode } from "./applyThermalMode";

export type RenderLabelOptions = {
  renderer?: LabelRenderer;
  thermal?: boolean;
  /** Global variables merged into the record before layout (e.g. warehouse_name). */
  templateVariables?: Record<string, unknown>;
  /** Optional layout tweaks (e.g. editor preview placeholders for empty bindings). */
  layoutOptions?: ComputeLayoutOptions;
};

/**
 * Renders a full label. Uses template + data to compute layout, then the given renderer (default SVG).
 * Elements are sorted by zIndex (higher = on top) before layout so render order matches layering.
 * When thermal is true, applies monochrome transformation (black fills/strokes, no images).
 */
export async function renderLabel(
  template: LabelTemplate,
  data: LabelRecord | Record<string, unknown>,
  rendererOrOptions?: LabelRenderer | RenderLabelOptions
): Promise<string> {
  const opts: RenderLabelOptions =
    rendererOrOptions && "render" in rendererOrOptions
      ? { renderer: rendererOrOptions }
      : (rendererOrOptions ?? {});
  const sortedElements = [...template.elements].sort(
    (a, b) => ((a as { zIndex?: number }).zIndex ?? 0) - ((b as { zIndex?: number }).zIndex ?? 0)
  );
  const sortedTemplate = { ...template, elements: sortedElements };
  const record = { ...(opts.templateVariables ?? {}), ...(data as Record<string, unknown>) };
  let items = computeLayoutFromTemplate(sortedTemplate, record as LabelRecord, opts.layoutOptions);
  log("LAYOUT ITEMS", items.length);
  if (opts.thermal) items = applyThermalMode(items);
  const widthMm = template.widthMm;
  const heightMm = template.heightMm;

  const r = opts.renderer ?? svgRenderer;
  const result = r.render(items, { widthMm, heightMm });
  return typeof result === "string" ? Promise.resolve(result) : result;
}
