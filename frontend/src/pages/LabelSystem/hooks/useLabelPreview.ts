import { useState, useEffect, useMemo } from "react";
import type { LabelTemplate } from "../../../types/labelSystem";
import { buildPreviewRecord } from "../../../labelSystem/repeaterPreview/buildPreviewRecord";
import { findRepeaters } from "../../../labelSystem/repeaterAnalysis/findRepeaters";
import { renderLabel } from "../../../labelRenderer";

export function useLabelPreview(template: LabelTemplate) {
  const previewRecord: Record<string, unknown> = useMemo(
    () => buildPreviewRecord(template),
    [template.elements, template.template_type]
  );

  const hasRepeaterPreview = useMemo(() => findRepeaters(template).length > 0, [template.elements]);

  const [labelSvg, setLabelSvg] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    renderLabel(template, previewRecord as Record<string, unknown>).then((svg) => {
      if (!cancelled) setLabelSvg(svg);
    });
    return () => { cancelled = true; };
  }, [template, previewRecord]);

  return { previewRecord, labelSvg, hasRepeaterPreview };
}
