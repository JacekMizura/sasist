import { useEffect, useState } from "react";

import { renderLabel } from "../../labelRenderer";
import type { LabelTemplate } from "../../types/labelSystem";

export type ProductLabelSvgPreviewProps = {
  template: LabelTemplate | null;
  /** Placeholder record or real product record — same renderer either way. */
  record: Record<string, unknown>;
  loadingTemplate?: boolean;
  emptyHint?: string;
  className?: string;
};

/**
 * Shared label preview chrome: white surface, centered SVG, subtle shadow.
 * Uses the Label System `renderLabel` pipeline only (no second renderer).
 */
export function ProductLabelSvgPreview({
  template,
  record,
  loadingTemplate = false,
  emptyHint = "Wybierz szablon etykiety",
  className = "",
}: ProductLabelSvgPreviewProps) {
  const [svg, setSvg] = useState<string>("");
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (template == null) {
      setSvg("");
      setError(null);
      setRendering(false);
      return;
    }
    let cancelled = false;
    setRendering(true);
    setError(null);
    void renderLabel(template, record)
      .then((result) => {
        if (!cancelled) setSvg(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setSvg("");
          setError(err instanceof Error ? err.message : "Nie udało się wyrenderować etykiety");
        }
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [template, record]);

  const busy = loadingTemplate || rendering;

  return (
    <div
      className={`flex min-h-[180px] w-full items-center justify-center rounded-lg border border-gray-200 bg-white p-6 ${className}`}
    >
      {busy ? (
        <span className="text-sm font-medium text-gray-400">Ładowanie…</span>
      ) : error ? (
        <span className="px-4 text-center text-sm text-red-600">{error}</span>
      ) : template == null || !svg ? (
        <span className="text-sm font-medium text-gray-400">{emptyHint}</span>
      ) : (
        <div
          className="inline-block max-w-full overflow-auto rounded-sm bg-white shadow-md ring-1 ring-black/5 [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-[280px] [&_svg]:w-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}
