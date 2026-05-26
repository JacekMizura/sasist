import { useMemo } from "react";
import type { LabelTemplate } from "../../types/labelSystem";
import { PREVIEW_SAMPLES } from "../../types/labelSystem";
import { buildGroupedLocationPreviewRecord } from "../locationGroupedVariables";
import type { BuildPreviewRecordOptions } from "../repeaterPreview/buildPreviewRecord";
import type { TemplateVariableAnalysis } from "../variableAnalysis/analyzeTemplateVariables";
import { analyzeTemplateVariables } from "../variableAnalysis/analyzeTemplateVariables";
import type { VariablePreview } from "../variableAnalysis/resolvePreviewVariables";
import { resolvePreviewVariables } from "../variableAnalysis/resolvePreviewVariables";

type PreviewDataType = "location" | "cart" | "basket" | "product" | "order";

export function useTemplateVariableAnalysis(
  template: LabelTemplate,
  options?: BuildPreviewRecordOptions,
) {
  const grouped = Boolean(options?.groupedLocationLabels);
  return useMemo(() => {
    const analysis: TemplateVariableAnalysis = analyzeTemplateVariables(template);
    const previewType: PreviewDataType = (template.template_type ?? "location") as PreviewDataType;
    let previewRecord: Record<string, unknown> =
      PREVIEW_SAMPLES[previewType] ?? PREVIEW_SAMPLES.location;
    if (previewType === "location" && grouped) {
      previewRecord = buildGroupedLocationPreviewRecord();
    }
    const previewVariables: VariablePreview[] = resolvePreviewVariables(analysis, previewRecord);
    return {
      rootVariables: analysis.rootVariables,
      datasets: analysis.datasets,
      previewVariables,
    };
  }, [template?.elements, template?.template_type, grouped]);
}
