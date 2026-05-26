import type { jsPDF } from "jspdf";
import type { LayoutState } from "../../../../types/warehouse";
import { getRackDisplayId } from "../../warehouseUtils";

const NEUTRAL_FILL: [number, number, number] = [226, 232, 240];
const NEUTRAL_STROKE: [number, number, number] = [71, 85, 105];

/**
 * Draws a top-down floor plan (racks only, neutral fill) in the given rectangle (mm).
 * Returns the Y position below the diagram.
 */
export function drawFloorPlanSection(
  pdf: jsPDF,
  layout: LayoutState,
  box: { x: number; y: number; w: number; h: number },
  title: string
): number {
  let { x: x0, y: y0, w: boxW, h: boxH } = box;
  pdf.setFontSize(11);
  pdf.setTextColor(30, 41, 59);
  pdf.text(title, x0, y0);
  y0 += 5;
  boxH -= 5;

  const cols = Math.max(1, layout.grid_cols);
  const rows = Math.max(1, layout.grid_rows);
  const cellW = boxW / cols;
  const cellH = boxH / rows;

  pdf.setDrawColor(NEUTRAL_STROKE[0], NEUTRAL_STROKE[1], NEUTRAL_STROKE[2]);
  pdf.setFillColor(NEUTRAL_FILL[0], NEUTRAL_FILL[1], NEUTRAL_FILL[2]);
  pdf.setLineWidth(0.15);

  for (const r of layout.racks) {
    const rx = x0 + r.x * cellW;
    const ry = y0 + r.y * cellH;
    const rw = Math.max(0.2, r.width * cellW);
    const rh = Math.max(0.2, r.height * cellH);
    pdf.rect(rx, ry, rw, rh, "FD");
    const label = getRackDisplayId(r, layout);
    const fs = Math.min(8, Math.max(5, Math.min(rw, rh) * 0.35));
    pdf.setFontSize(fs);
    pdf.setTextColor(30, 41, 59);
    const short =
      label.length > 12 && Math.min(rw, rh) < 12 ? `${label.slice(0, 10)}…` : label;
    if (rw > 4 && rh > 3 && short) {
      pdf.text(short, rx + rw / 2, ry + rh / 2 + fs * 0.35, { align: "center", maxWidth: Math.max(1, rw - 1) });
    }
  }

  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  return y0 + boxH + 4;
}
