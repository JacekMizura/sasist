import type { jsPDF } from "jspdf";
import type { WarehouseReportPdfContext } from "./shared/types";
import { drawFloorPlanSection } from "./shared/floorPlanPdf";
import { formatDm3, formatPln } from "./shared/pdfFormat";

const M = 14;
const LH = 5.5;

/** Detailed technical report: full metrics, per-template grids from level_config, floor plan. */
export function appendTechnicalWarehouseReport(pdf: jsPDF, ctx: WarehouseReportPdfContext): void {
  const { layout, metrics, gridUnitCm, warehouseValuePln } = ctx;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const innerW = pageW - 2 * M;
  const whName = layout.warehouse_name || layout.name || "Magazyn";

  let y = M;
  pdf.setFontSize(15);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Raport techniczny magazynu", M, y);
  y += LH + 3;

  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`${whName} · ${metrics.exportDate.toLocaleString("pl-PL")}`, M, y);
  y += LH + 4;

  pdf.setFontSize(11);
  pdf.setTextColor(17, 24, 39);
  pdf.text("Parametry budynku", M, y);
  y += LH + 2;
  pdf.setFontSize(9);
  pdf.text(
    `Szer. × gł. × wys. (m): ${metrics.buildingWidthM.toFixed(3)} × ${metrics.buildingDepthM.toFixed(3)} × ${metrics.buildingHeightM.toFixed(3)}`,
    M,
    y
  );
  y += LH;
  pdf.text(`Powierzchnia (m²): ${metrics.surfaceM2.toFixed(2)} · Kubatura (m³): ${metrics.buildingVolumeM3.toFixed(2)}`, M, y);
  y += LH + 3;

  pdf.setFontSize(11);
  pdf.text("Metryki objętości i wartości", M, y);
  y += LH + 2;
  pdf.setFontSize(9);
  const util = Number.isFinite(metrics.utilizationPct) ? metrics.utilizationPct : 0;
  pdf.text(`Zajętość regałów: ${util.toFixed(2)}%`, M, y);
  y += LH;
  pdf.text(`Wartość zapasów (Σ ilość × cena zakupu, tylko lokacje w układzie): ${formatPln(warehouseValuePln)}`, M, y, {
    maxWidth: innerW,
  });
  y += LH + 2;
  pdf.text(`Pojemność całkowita (szac. regały): ${formatDm3(metrics.totalCapacityDm3)}`, M, y);
  y += LH;
  pdf.text(`Objętość zajęta: ${formatDm3(metrics.usedVolumeDm3)} · wolna: ${formatDm3(Math.max(0, metrics.totalCapacityDm3 - metrics.usedVolumeDm3))}`, M, y, {
    maxWidth: innerW,
  });
  y += LH + 3;

  pdf.setFontSize(11);
  pdf.text("Podział typów lokalizacji", M, y);
  y += LH + 2;
  pdf.setFontSize(9);
  pdf.text(`PRIMARY — liczba: ${metrics.primary.count} · objętość: ${formatDm3(metrics.primary.volumeDm3)}`, M, y);
  y += LH;
  pdf.text(`RESERVE — liczba: ${metrics.reserve.count} · objętość: ${formatDm3(metrics.reserve.volumeDm3)}`, M, y);
  y += LH;
  pdf.text(`DAMAGED — liczba: ${metrics.damaged.count} · objętość: ${formatDm3(metrics.damaged.volumeDm3)}`, M, y);
  y += LH + 4;

  pdf.setFontSize(11);
  pdf.text("Szablony regałów (grupowanie po templateId)", M, y);
  y += LH + 2;
  pdf.setFontSize(8);

  for (const t of metrics.templates) {
    const blockH = 8 + (t.gridLines.length + 1) * LH;
    if (y + blockH > pageH - M) {
      pdf.addPage("a4", "portrait");
      y = M;
    }
    pdf.setFontSize(9);
    pdf.setTextColor(30, 41, 59);
    pdf.text(`${t.label} (id: ${t.templateId ?? "—"})`, M, y);
    y += LH;
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Wymiary (cm): ${t.dimensionsCm} · Regałów: ${t.rackCount} · Lokacji: ${t.locationCount}`, M, y, {
      maxWidth: innerW,
    });
    y += LH;
    pdf.text("Układ poziomów (level_config → poziomy × lokacje):", M, y);
    y += LH;
    for (const line of t.gridLines.length > 0 ? t.gridLines : ["(brak level_config)"]) {
      pdf.text(line, M + 2, y);
      y += LH - 0.5;
    }
    y += 6;
  }

  pdf.addPage("a4", "landscape");
  const lw = pdf.internal.pageSize.getWidth();
  const lh = pdf.internal.pageSize.getHeight();
  drawFloorPlanSection(pdf, layout, { x: 12, y: 14, w: lw - 24, h: lh - 28 }, "Plan magazynu (wektorowy)");

  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    `Skala siatki: 1 komórka = ${gridUnitCm} cm. Schemat nie jest zrzutem ekranu edytora — rysunek wektorowy z układu.`,
    12,
    lh - 10,
    { maxWidth: lw - 24 }
  );
}
