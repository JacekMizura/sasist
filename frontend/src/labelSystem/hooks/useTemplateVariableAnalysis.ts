import { useMemo } from "react";
import type { LabelTemplate } from "../../types/labelSystem";
import { PREVIEW_SAMPLES } from "../../types/labelSystem";
import type { TemplateVariableAnalysis } from "../variableAnalysis/analyzeTemplateVariables";
import { analyzeTemplateVariables } from "../variableAnalysis/analyzeTemplateVariables";
import type { VariablePreview } from "../variableAnalysis/resolvePreviewVariables";
import { resolvePreviewVariables } from "../variableAnalysis/resolvePreviewVariables";

type PreviewDataType = "location" | "cart" | "basket" | "product" | "order";

export function useTemplateVariableAnalysis(template: LabelTemplate) {
  return useMemo(() => {
    const analysis: TemplateVariableAnalysis = analyzeTemplateVariables(template);
    const previewType: PreviewDataType = (template.template_type ?? "location") as PreviewDataType;
    const previewRecord: Record<string, unknown> =
      PREVIEW_SAMPLES[previewType] ?? PREVIEW_SAMPLES.location;
    const previewVariables: VariablePreview[] = resolvePreviewVariables(analysis, previewRecord);
    return {
      rootVariables: analysis.rootVariables,
      datasets: analysis.datasets,
      previewVariables,
    };
  }, [template?.elements, template?.template_type]);
}
