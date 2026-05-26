/**
 * Label PDF page geometry for jsPDF (must match backend `POINTS_PER_MM` in label_engine / label_render_service).
 *
 * jsPDF quirk: with a custom `format: [w, h]`, `_addPage` swaps dimensions in **portrait** when
 * width > height, which breaks wide labels (e.g. 203×68 mm). Use {@link jsPdfOrientationForLabelShape}
 * so the media box stays width×height of the physical label.
 */
export const LABEL_MM_TO_PDF_PT = 2.83465;

export function labelPageSizePt(widthMm: number, heightMm: number): { widthPt: number; heightPt: number } {
  const wMm = Math.max(0.01, Number(widthMm) || 0.01);
  const hMm = Math.max(0.01, Number(heightMm) || 0.01);
  return {
    widthPt: wMm * LABEL_MM_TO_PDF_PT,
    heightPt: hMm * LABEL_MM_TO_PDF_PT,
  };
}

/** Wide or square label → landscape avoids jsPDF portrait auto-swap; tall label → portrait. */
export function jsPdfOrientationForLabelShape(widthMm: number, heightMm: number): "p" | "l" {
  return widthMm >= heightMm ? "l" : "p";
}
