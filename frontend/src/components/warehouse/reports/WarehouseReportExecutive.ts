import type { jsPDF } from "jspdf";
import type { WarehouseReportPdfContext } from "./shared/types";
import { drawFloorPlanSection } from "./shared/floorPlanPdf";
import { formatDm3, formatPln } from "./shared/pdfFormat";

const M = 14;
const LH = 6;

/** Short business-oriented report (1–2 pages). */
export function appendExecutiveWarehouseReport(pdf: jsPDF, ctx: WarehouseReportPdfContext): void {
  const { layout, metrics, gridUnitCm, warehouseValuePln } = ctx;
  const pageW = pdf.internal.pageSize.getWidth();
  const whName = layout.warehouse_name || layout.name || "Magazyn";

  let y = M;
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Raport magazynu — skrót dla zarządu", M, y);
  y += LH + 4;

  pdf.setFontSize(10);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`Magazyn: ${whName}`, M, y);
  y += LH;
  pdf.text(`Data: ${metrics.exportDate.toLocaleString("pl-PL")}`, M, y);
  y += LH + 4;

  pdf.setFontSize(12);
  pdf.setTextColor(17, 24, 39);
  pdf.text("Kluczowe wskaźniki", M, y);
  y += LH + 2;

  pdf.setFontSize(10);
  const util = Number.isFinite(metrics.utilizationPct) ? metrics.utilizationPct : 0;
  pdf.text(`Zajętość regałów: ${util.toFixed(1)}%`, M, y);
  y += LH;
  pdf.text(`Wartość zapasów (Σ ilość × cena zakupu, lokacje w układzie): ${formatPln(warehouseValuePln)}`, M, y, {
    maxWidth: pageW - 2 * M,
  });
  y += LH + 2;
  pdf.text(
    `Objętość: wykorzystana ${formatDm3(metrics.usedVolumeDm3)} / pojemność ${formatDm3(metrics.totalCapacityDm3)} · wolna ${formatDm3(Math.max(0, metrics.totalCapacityDm3 - metrics.usedVolumeDm3))}`,
    M,
    y,
    { maxWidth: pageW - 2 * M }
  );
  y += LH + 4;

  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(
    `PRIMARY: ${metrics.primary.count} lok., ${formatDm3(metrics.primary.volumeDm3)} · RESERVE: ${metrics.reserve.count} lok., ${formatDm3(metrics.reserve.volumeDm3)} · DAMAGED: ${metrics.damaged.count} lok., ${formatDm3(metrics.damaged.volumeDm3)}`,
    M,
    y,
    { maxWidth: pageW - 2 * M }
  );
  y += LH + 6;

  const planH = Math.min(85, pdf.internal.pageSize.getHeight() - y - M);
  const yAfter = drawFloorPlanSection(pdf, layout, { x: M, y, w: pageW - 2 * M, h: planH }, "Układ regałów (schemat)");

  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Siatka: 1 komórka = ${gridUnitCm} cm · Kolory zajętości nie są stosowane w schemacie PDF.`, M, yAfter + 4, {
    maxWidth: pageW - 2 * M,
  });
}
