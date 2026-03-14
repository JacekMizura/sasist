import { jsPDF } from "jspdf";
import type { PrinterProfile } from "../../types/printerProfiles";
import { applyCalibration } from "./applyCalibration";
import { drawSvgVector } from "./svgToPdfVector";

/** When true, use vector SVG→PDF; when false, use raster (SVG→PNG→PDF). */
const VECTOR_PDF_ENABLED = true;

const PDF_PX_PER_MM = 6;

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

export async function exportLabelsPdf(
  svgs: string[],
  widthMm: number,
  heightMm: number,
  filename: string,
  printerProfile?: PrinterProfile | null
): Promise<void> {
  if (!svgs.length) return;

  const pdf = new jsPDF({ unit: "mm", format: [widthMm, heightMm] });

  for (let i = 0; i < svgs.length; i++) {
    if (i > 0) pdf.addPage([widthMm, heightMm]);
    const calibratedSvg = applyCalibration(svgs[i], printerProfile);

    if (VECTOR_PDF_ENABLED) {
      try {
        await drawSvgVector(pdf, calibratedSvg, 0, 0, widthMm, heightMm);
      } catch {
        const pngDataUrl = await svgToPngDataUrl(calibratedSvg, widthMm, heightMm);
        pdf.addImage(pngDataUrl, "PNG", 0, 0, widthMm, heightMm);
      }
    } else {
      const pngDataUrl = await svgToPngDataUrl(calibratedSvg, widthMm, heightMm);
      pdf.addImage(pngDataUrl, "PNG", 0, 0, widthMm, heightMm);
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

