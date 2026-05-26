import type { LabelTemplate } from "../../types/labelSystem";
import { PREVIEW_SAMPLES } from "../../types/labelSystem";
import type { PreviewDataType } from "../../types/labelSystem";
import { buildGroupedLocationPreviewRecord } from "../locationGroupedVariables";
import { findRepeaters } from "../repeaterAnalysis/findRepeaters";
import { generatePreviewDataset } from "./generatePreviewDataset";

export type BuildPreviewRecordOptions = {
  /** Location templates: emulate CSV merged label (slot fields only; singles blanked). */
  groupedLocationLabels?: boolean;
};

/**
 * Build a preview record by merging base PREVIEW_SAMPLES with synthetic repeater arrays.
 * Used only for designer preview; does not change layout engine or renderLabel contract.
 */
export function buildPreviewRecord(
  template: LabelTemplate,
  options?: BuildPreviewRecordOptions,
): Record<string, unknown> {
  const templateType = template.template_type ?? "location";
  let base = PREVIEW_SAMPLES[templateType as PreviewDataType] ?? PREVIEW_SAMPLES.location;
  if (templateType === "location" && options?.groupedLocationLabels) {
    base = buildGroupedLocationPreviewRecord();
  }
  const record: Record<string, unknown> = { ...base };

  const repeaters = findRepeaters(template);
  const datasetNames = [...new Set(repeaters.map((r) => r.dataset))];

  for (const name of datasetNames) {
    if (!name || typeof name !== "string") continue;
    // Dataset items must be independent objects, not references to root record.
    record[name] = generatePreviewDataset(name);
  }

  return record;
}
