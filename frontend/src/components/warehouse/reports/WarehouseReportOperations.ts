import type { jsPDF } from "jspdf";
import type { WarehouseReportPdfContext } from "./shared/types";
import { drawFloorPlanSection } from "./shared/floorPlanPdf";
import { formatDm3, formatPln } from "./shared/pdfFormat";

const M = 14;
const LH = 6;

/** Warehouse-level operations report: metrics + full-width floor plan + template summary. */
export function appendOperationsWarehouseReport(pdf: jsPDF, ctx: WarehouseReportPdfContext): void {
  const { layout, metrics, gridUnitCm, warehouseValuePln } = ctx;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const whName = layout.warehouse_name || layout.name || "Magazyn";

  let y = M;
  pdf.setFontSize(15);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Raport operacyjny magazynu", M, y);
  y += LH + 4;

  pdf.setFontSize(10);
  pdf.setTextColor(55, 65, 81);
  pdf.text(`${whName} · ${metrics.exportDate.toLocaleString("pl-PL")}`, M, y);
  y += LH + 4;

  pdf.setFontSize(12);
  pdf.setTextColor(17, 24, 39);
  pdf.text("Budynek i kubatura", M, y);
  y += LH + 2;
  pdf.setFontSize(10);
  pdf.text(
    `Wymiary (m): ${metrics.buildingWidthM.toFixed(2)} × ${metrics.buildingDepthM.toFixed(2)} × ${metrics.buildingHeightM.toFixed(2)}`,
    M,
    y
  );
  y += LH;
  pdf.text(`Powierzchnia: ${metrics.surfaceM2.toFixed(2)} m² · Kubatura: ${metrics.buildingVolumeM3.toFixed(2)} m³`, M, y);
  y += LH + 4;

  pdf.setFontSize(12);
  pdf.text("Zajętość i wartość", M, y);
  y += LH + 2;
  pdf.setFontSize(10);
  const util = Number.isFinite(metrics.utilizationPct) ? metrics.utilizationPct : 0;
  pdf.text(`Zajętość: ${util.toFixed(1)}%`, M, y);
  y += LH;
  pdf.text(`Wartość zapasów (lokacje w układzie): ${formatPln(warehouseValuePln)}`, M, y);
  y += LH;
  pdf.text(`Pojemność: ${formatDm3(metrics.totalCapacityDm3)} · Zajęta: ${formatDm3(metrics.usedVolumeDm3)} · Wolna: ${formatDm3(Math.max(0, metrics.totalCapacityDm3 - metrics.usedVolumeDm3))}`, M, y, {
    maxWidth: pageW - 2 * M,
  });
  y += LH + 4;

  pdf.setFontSize(12);
  pdf.text("Lokalizacje (PRIMARY / RESERVE / DAMAGED)", M, y);
  y += LH + 2;
  pdf.setFontSize(10);
  pdf.text(
    `PRIMARY: ${metrics.primary.count} lok. · ${formatDm3(metrics.primary.volumeDm3)}`,
    M,
    y
  );
  y += LH;
  pdf.text(
    `RESERVE: ${metrics.reserve.count} lok. · ${formatDm3(metrics.reserve.volumeDm3)}`,
    M,
    y
  );
  y += LH;
  pdf.text(
    `DAMAGED: ${metrics.damaged.count} lok. · ${formatDm3(metrics.damaged.volumeDm3)}`,
    M,
    y
  );
  y += LH + 4;

  pdf.setFontSize(12);
  pdf.text("Szablony (w układzie)", M, y);
  y += LH + 2;
  pdf.setFontSize(9);
  for (const t of metrics.templates) {
    if (y > pageH - 24) {
      pdf.addPage("a4", "portrait");
      y = M;
    }
    pdf.text(
      `• ${t.label} — ${t.dimensionsCm} cm · regały: ${t.rackCount} · lokacje: ${t.locationCount}`,
      M,
      y,
      { maxWidth: pageW - 2 * M }
    );
    y += LH + 1;
  }
  y += 4;

  pdf.addPage("a4", "landscape");
  const lw = pdf.internal.pageSize.getWidth();
  const lh = pdf.internal.pageSize.getHeight();
  drawFloorPlanSection(pdf, layout, { x: 12, y: 14, w: lw - 24, h: lh - 28 }, "Plan magazynu (regały)");

  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Siatka: 1 komórka = ${gridUnitCm} cm`, 12, lh - 10);
}
