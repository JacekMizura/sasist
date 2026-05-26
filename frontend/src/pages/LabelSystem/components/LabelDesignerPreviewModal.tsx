import { useEffect, useMemo } from "react";
import { X } from "lucide-react";

export type LabelDesignerPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  /** Raw SVG string from renderLabel */
  labelSvg: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  templateName: string;
};

/**
 * Full-size preview of the label with visible print bounds (editor only).
 */
export function LabelDesignerPreviewModal({
  open,
  onClose,
  labelSvg,
  widthMm,
  heightMm,
  dpi,
  templateName,
}: LabelDesignerPreviewModalProps) {
  const previewHtml = useMemo(() => {
    const safe = labelSvg.replace(/<\/script/gi, "<\\/script");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
      html,body{margin:0;min-height:100%;background:#f1f5f9;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;}
      .frame{border:2px dashed #64748b;border-radius:4px;background:#fff;box-shadow:0 4px 24px rgba(15,23,42,0.08);padding:0;line-height:0;}
      svg{display:block;max-width:min(92vw,920px);max-height:min(78vh,720px);width:auto;height:auto;}
    </style></head><body><div class="frame">${safe}</div></body></html>`;
  }, [labelSvg]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="label-preview-title">
      <button type="button" className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]" aria-label="Zamknij podgląd" onClick={onClose} />
      <div className="relative z-[1] flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/20">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/90 px-4 py-3">
          <div className="min-w-0">
            <h2 id="label-preview-title" className="truncate text-[14px] font-semibold text-slate-900">
              Podgląd etykiety
            </h2>
            <p className="truncate text-[11px] text-slate-500">{templateName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-slate-100/90 p-4">
          <div className="mx-auto flex h-[min(78vh,720px)] min-h-[240px] w-full max-w-5xl flex-col items-center gap-3">
            <p className="text-center text-[11px] font-medium text-slate-600">
              Obszar druku: {Math.round(widthMm)} × {Math.round(heightMm)} mm · {dpi} DPI
            </p>
            <iframe title="Podgląd SVG etykiety" className="h-full w-full flex-1 rounded-lg border border-slate-200 bg-white shadow-inner" srcDoc={previewHtml} sandbox="allow-same-origin" />
            <p className="max-w-md shrink-0 text-center text-[10px] leading-relaxed text-slate-500">
              Ramka przerywana pokazuje granice etykiety. Podgląd używa przykładowych danych — eksport może wyglądać inaczej, jeśli brakuje pól w rekordzie.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
