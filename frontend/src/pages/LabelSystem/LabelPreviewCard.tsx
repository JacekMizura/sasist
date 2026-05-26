/**
 * Preview card using renderLabel (same as Designer and PDF).
 * All cards use a fixed container size; the label SVG scales to fit inside.
 */
import { useEffect, useState } from "react";
import type { LabelTemplate } from "../../types/labelSystem";
import type { LabelRecord } from "../../types/labelSystem";
import { renderLabel } from "../../labelRenderer";
import { findRepeaters } from "../../labelSystem/repeaterAnalysis/findRepeaters";
import { MAX_PREVIEW_ITEMS } from "../../labelSystem/repeaterPreview/generatePreviewDataset";

/** Fixed preview container size so every card looks identical. */
const PREVIEW_WIDTH = 180;
const PREVIEW_HEIGHT = 120;

export type LabelPreviewCardTemplate = Pick<LabelTemplate, "widthMm" | "heightMm" | "elements"> & {
  id?: string;
  name?: string;
  dpi?: number;
  template_type?: LabelTemplate["template_type"];
};

type Props = {
  template: LabelPreviewCardTemplate;
  record: LabelRecord | Record<string, unknown>;
  /** @deprecated Container size is fixed (PREVIEW_WIDTH × PREVIEW_HEIGHT). Kept for backward compatibility. */
  cardWidthPx?: number;
};

/**
 * Renders one label preview card using renderLabel (same pipeline as Designer and PDF).
 * Every card uses the same fixed container size; the label scales to fit and is centered.
 */
export function LabelPreviewCard({ template, record }: Props) {
  const labelW = template.widthMm;
  const labelH = template.heightMm;
  const scale = Math.min(PREVIEW_WIDTH / labelW, PREVIEW_HEIGHT / labelH);
  const offsetX = (PREVIEW_WIDTH - labelW * scale) / 2;
  const offsetY = (PREVIEW_HEIGHT - labelH * scale) / 2;
  const hasRepeaters = findRepeaters(template).length > 0;

  const [svg, setSvg] = useState<string>("");
  const fullTemplate: LabelTemplate = {
    ...template,
    id: template.id ?? "",
    name: template.name ?? "",
    dpi: template.dpi ?? 96,
    elements: template.elements,
  };

  useEffect(() => {
    let cancelled = false;
    renderLabel(fullTemplate, record as Record<string, unknown>)
      .then((out) => {
        if (!cancelled) setSvg(out);
      })
      .catch(() => {
        if (!cancelled) setSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, [fullTemplate.id, fullTemplate.name, fullTemplate.widthMm, fullTemplate.heightMm, JSON.stringify(fullTemplate.elements), JSON.stringify(record)]);

  const scaledSvg = svg
    .replace(/width="[^"]*"/, 'width="100%"')
    .replace(/height="[^"]*"/, 'height="100%"');

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
      {hasRepeaters && (
        <span
          style={{
            fontSize: 10,
            color: "#64748b",
            marginBottom: 4,
          }}
        >
          Podgląd: {MAX_PREVIEW_ITEMS} przykładowych pozycji
        </span>
      )}
      <div
        style={{
          width: PREVIEW_WIDTH,
          height: PREVIEW_HEIGHT,
          padding: 6,
          backgroundColor: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 4,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: offsetX,
            top: offsetY,
            width: labelW * scale,
            height: labelH * scale,
          }}
        >
          {scaledSvg ? (
            <div
              dangerouslySetInnerHTML={{ __html: scaledSvg }}
              style={{ width: "100%", height: "100%" }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
