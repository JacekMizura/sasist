import { useEffect, useState } from "react";
import type { LabelTemplate } from "../../../types/labelSystem";
import { buildPreviewRecord } from "../../../labelSystem/repeaterPreview/buildPreviewRecord";
import { renderLabel } from "../../../labelRenderer";

const previewSvgCache = new Map<string, Promise<string>>();

function getPreviewSvg(template: LabelTemplate, cacheKey: string): Promise<string> {
  let existing = previewSvgCache.get(cacheKey);
  if (!existing) {
    existing = (async () => {
      const record = buildPreviewRecord(template);
      return renderLabel(template, record, {
        layoutOptions: { editorEmptyBindingPlaceholder: "Brak danych" },
      });
    })();
    previewSvgCache.set(cacheKey, existing);
  }
  return existing;
}

type Props = {
  template: LabelTemplate;
  /** Stable key for caching (e.g. preset type id). */
  cacheKey: string;
  className?: string;
};

export function LabelGalleryThumbnail({ template, cacheKey, className = "h-[140px]" }: Props) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPreviewSvg(template, cacheKey)
      .then((result) => {
        if (!cancelled) setSvg(result);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [template, cacheKey]);

  return (
    <div
      className={`relative w-full shrink-0 overflow-hidden border-b border-slate-200 bg-slate-50 ${className}`}
      aria-hidden
    >
      <div className="flex h-full w-full items-center justify-center p-3">
        {svg ? (
          <div
            className="flex max-h-full max-w-full items-center justify-center rounded border border-slate-200/90 bg-white p-1.5 shadow-sm [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="h-[72%] w-[78%] animate-pulse rounded border border-slate-200/70 bg-slate-100/90" />
        )}
      </div>
    </div>
  );
}
