import { useState, useEffect, useMemo } from "react";
import type { LabelTemplate } from "../../../types/labelSystem";
import { PREVIEW_SAMPLES } from "../../../types/labelSystem";
import { renderLabel } from "../../../labelRenderer";

export function useLabelPreview(template: LabelTemplate) {
  const previewRecord: Record<string, unknown> = useMemo(
    () => PREVIEW_SAMPLES[template.template_type ?? "location"],
    [template.template_type]
  );

  const [labelSvg, setLabelSvg] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    renderLabel(template, previewRecord as Record<string, unknown>).then((svg) => {
      if (!cancelled) setLabelSvg(svg);
    });
    return () => { cancelled = true; };
  }, [template, previewRecord]);

  return { previewRecord, labelSvg };
}
