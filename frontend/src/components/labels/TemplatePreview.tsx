import { useState, useEffect } from "react";
import type { LabelTemplate } from "../../types/labelSystem";
import { buildPreviewRecord } from "../../labelSystem/repeaterPreview/buildPreviewRecord";
import { renderLabel } from "../../labelRenderer";

const PREVIEW_MAX_HEIGHT_PX = 260;

export type TemplatePreviewProps = {
  /** Template from template_json (must have widthMm, heightMm, elements, template_type). */
  template: LabelTemplate | Record<string, unknown>;
  /** Optional stable id so we only re-render when showing a different template. */
  templateId?: number | string;
  /** When set, scale label to fill this container (width × height px) while preserving aspect ratio. */
  containerWidthPx?: number;
  containerHeightPx?: number;
};

function normalizeTemplate(t: LabelTemplate | Record<string, unknown>): LabelTemplate {
  const raw = t as Record<string, unknown>;
  return {
    id: (raw.id as string) ?? "preview",
    name: (raw.name as string) ?? "",
    widthMm: Number(raw.widthMm) || 50,
    heightMm: Number(raw.heightMm) || 30,
    dpi: Number(raw.dpi) || 300,
    elements: Array.isArray(raw.elements) ? raw.elements : [],
    template_type: (raw.template_type as LabelTemplate["template_type"]) ?? "location",
  };
}

/**
 * Renders label preview using the same pipeline as the designer:
 * buildPreviewRecord(template) → renderLabel(template, record).
 * Shows background image, real barcode, shapes, colors, arrows, polygons.
 */
export function TemplatePreview({ template, templateId, containerWidthPx, containerHeightPx }: TemplatePreviewProps) {
  const [svg, setSvg] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeTemplate(template);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const record = buildPreviewRecord(normalized);
    renderLabel(normalized, record as Record<string, unknown>)
      .then((result) => {
        if (!cancelled) setSvg(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Preview failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [templateId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 px-8 text-slate-400 text-sm" style={{ minHeight: 120 }}>
        <span className="w-5 h-5 border-2 border-slate-300 border-t-cyan-600 rounded-full animate-spin" />
        <span className="ml-2">Ładowanie…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 px-4 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (!svg) return null;

  const widthMm = normalized.widthMm;
  const heightMm = normalized.heightMm;
  const useContainer = containerWidthPx != null && containerHeightPx != null && containerWidthPx > 0 && containerHeightPx > 0;

  if (useContainer) {
    const scaleX = containerWidthPx / widthMm;
    const scaleY = containerHeightPx / heightMm;
    const scale = Math.min(scaleX, scaleY);
    const scaledWidth = widthMm * scale;
    const scaledHeight = heightMm * scale;
    const offsetX = (containerWidthPx - scaledWidth) / 2;
    const offsetY = (containerHeightPx - scaledHeight) / 2;

    return (
      <div
        style={{
          width: containerWidthPx,
          height: containerHeightPx,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: offsetX,
            top: offsetY,
            width: widthMm,
            height: heightMm,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <div
            className="[&_svg]:block [&_svg]:max-w-full [&_svg]:max-h-full"
            style={{ width: widthMm, height: heightMm }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="[&_svg]:max-h-[260px] [&_svg]:w-auto [&_svg]:h-auto [&_svg]:block"
      style={{ maxHeight: PREVIEW_MAX_HEIGHT_PX }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
