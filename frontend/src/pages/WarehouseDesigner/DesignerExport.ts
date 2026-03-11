import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { LayoutState } from "../../types/warehouse";

export interface ExportPdfParams {
  canvasEl: HTMLDivElement | null;
  layout: LayoutState;
  gridUnitCm: number;
  pdfFailedMessage: string;
}

export async function exportPdf(params: ExportPdfParams): Promise<void> {
  const { canvasEl, layout, gridUnitCm, pdfFailedMessage } = params;
  if (!canvasEl) return;
  try {
    const canvas = await html2canvas(canvasEl, { scale: 2, useCORS: true, backgroundColor: "#0f172a" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height / canvas.width) * w;
    const fitH = Math.min(imgH, h - 42);
    pdf.addImage(imgData, "PNG", 0, 0, w, fitH);
    pdf.setFontSize(9);
    pdf.setTextColor(60, 60, 60);
    const yLeg = fitH + 8;
    pdf.text(`Magazyn: ${layout.warehouse_name || layout.name || "—"}  |  Data eksportu: ${new Date().toLocaleString("pl-PL")}`, 10, yLeg);
    pdf.text(`Skala: 1 komórka = ${gridUnitCm} cm`, 10, yLeg + 6);
    pdf.text("Legenda: Zielony = niska zajętość (0–50%), Żółty = średnia (50–80%), Czerwony = wysoka (80–100%)  |  Niebieski = strefa pakowania  |  Szary = słupy/ściany/drzwi", 10, yLeg + 12);
    pdf.save(`plan-${(layout.name || "export").replace(/\s+/g, "-")}.pdf`);
  } catch (err) {
    console.error(err);
    alert(pdfFailedMessage);
  }
}

export function exportCsv(layout: LayoutState): void {
  const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const headers = ["id", "aisle_letter", "rack_index", "x", "y", "width", "height", "width_cm", "length_cm", "height_cm", "levels", "bins_per_level"];
  const rows = layout.racks.map((r) =>
    headers.map((h) => escape(String((r as Record<string, unknown>)[h] ?? ""))).join(",")
  );
  const csv = "\uFEFF" + headers.join(",") + "\r\n" + rows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `layout-${(layout.name || "export").replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportLocationsMapCsv(layout: LayoutState): void {
  const escape = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const headers = ["locationUUID", "name", "capacity_dm3"];
  const rows: string[] = [];
  for (const rack of layout.racks) {
    for (const bin of rack.bins ?? []) {
      const uuid = (bin as { locationUUID?: string }).locationUUID ?? (bin as { location_uuid?: string }).location_uuid ?? "";
      const name = (bin as { label?: string }).label ?? (bin as { location_id?: string }).location_id ?? uuid;
      const capacity = (bin as { volume_dm3?: number }).volume_dm3 ?? 0;
      rows.push([escape(uuid), escape(String(name)), String(capacity)].join(","));
    }
  }
  const csv = "\uFEFF" + headers.join(",") + "\r\n" + rows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mapa-lokalizacji-${(layout.name || "export").replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJson(layout: LayoutState): void {
  const json = JSON.stringify({ ...layout, updatedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `layout-${(layout.name || "export").replace(/\s+/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
