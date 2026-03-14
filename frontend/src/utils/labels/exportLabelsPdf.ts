import { jsPDF } from "jspdf";
import type { PrinterProfile } from "../../types/printerProfiles";
import { applyCalibration } from "./applyCalibration";
import { drawSvgVector } from "./svgToPdfVector";

/** When true, use vector SVG→PDF; when false, use raster (SVG→PNG→PDF). */
const VECTOR_PDF_ENABLED = true;

const PDF_PX_PER_MM = 6;

/** 1 mm = 2.83465 pt. Use for page size so jsPDF format is in points. */
const POINTS_PER_MM = 2.83465;

async function svgToPngDataUrl(svgString: string, widthMm: number, heightMm: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    img.onload = () => {
      const cw = Math.max(1, Math.round(widthMm * PDF_PX_PER_MM));
      const ch = Math.max(1, Math.round(heightMm * PDF_PX_PER_MM));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2d unavailable"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("SVG image load failed"));
    img.src = dataUrl;
  });
}

/**
 * Draw SVG onto the current PDF page as raster (PNG).
 * Used for templates with repeaters where svg2pdf can render content outside page bounds.
 */
async function drawSvgRaster(
  pdf: import("jspdf").jsPDF,
  svgString: string,
  wPt: number,
  hPt: number,
  widthMm: number,
  heightMm: number
): Promise<void> {
  const pngDataUrl = await svgToPngDataUrl(svgString, widthMm, heightMm);
  pdf.addImage(pngDataUrl, "PNG", 0, 0, wPt, hPt);
}

export type ExportLabelsPdfTemplate = { elements?: Array<{ type?: string }> };

export async function exportLabelsPdf(
  svgs: string[],
  widthMm: number,
  heightMm: number,
  filename: string,
  printerProfile?: PrinterProfile | null,
  template?: ExportLabelsPdfTemplate | null
): Promise<void> {
  if (!svgs.length) return;

  const wPt = widthMm * POINTS_PER_MM;
  const hPt = heightMm * POINTS_PER_MM;
  const orientation = widthMm > heightMm ? "l" : "p";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [wPt, hPt] });

  const hasRepeater = template?.elements?.some((el) => el.type === "repeater") ?? false;

  if (process.env.NODE_ENV === "development") {
    console.debug("[exportLabelsPdf] pageSize pt:", pdf.internal.pageSize.getWidth(), "×", pdf.internal.pageSize.getHeight());
  }

  for (let i = 0; i < svgs.length; i++) {
    if (i > 0) pdf.addPage([wPt, hPt], orientation);
    const calibratedSvg = applyCalibration(svgs[i], printerProfile);

    if (hasRepeater) {
      await drawSvgRaster(pdf, calibratedSvg, wPt, hPt, widthMm, heightMm);
    } else if (VECTOR_PDF_ENABLED) {
      try {
        await drawSvgVector(pdf, calibratedSvg, 0, 0, wPt, hPt);
      } catch {
        await drawSvgRaster(pdf, calibratedSvg, wPt, hPt, widthMm, heightMm);
      }
    } else {
      await drawSvgRaster(pdf, calibratedSvg, wPt, hPt, widthMm, heightMm);
    }
  }

  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

