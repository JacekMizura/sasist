import { useState, useEffect, useMemo } from "react";
import type { LabelTemplate } from "../../../types/labelSystem";
import {
  buildPreviewRecord,
  type BuildPreviewRecordOptions,
} from "../../../labelSystem/repeaterPreview/buildPreviewRecord";
import { findRepeaters } from "../../../labelSystem/repeaterAnalysis/findRepeaters";
import { renderLabel } from "../../../labelRenderer";

export function useLabelPreview(template: LabelTemplate, options?: BuildPreviewRecordOptions) {
  const grouped = Boolean(options?.groupedLocationLabels);
  const previewRecord: Record<string, unknown> = useMemo(
    () => buildPreviewRecord(template, options),
    [template.elements, template.template_type, grouped]
  );

  const hasRepeaterPreview = useMemo(() => findRepeaters(template).length > 0, [template.elements]);

  const [labelSvg, setLabelSvg] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    renderLabel(template, previewRecord as Record<string, unknown>, {
      layoutOptions: { editorEmptyBindingPlaceholder: "Brak danych" },
    }).then((svg) => {
      if (!cancelled) setLabelSvg(svg);
    });
    return () => { cancelled = true; };
  }, [template, previewRecord]);

  return { previewRecord, labelSvg, hasRepeaterPreview };
}
