import { jsPDF } from "jspdf";
import type { WarehouseReportPdfContext, WarehouseReportVariant } from "./shared/types";
import { appendExecutiveWarehouseReport } from "./WarehouseReportExecutive";
import { appendOperationsWarehouseReport } from "./WarehouseReportOperations";
import { appendTechnicalWarehouseReport } from "./WarehouseReportTechnical";

const VARIANT_FILE: Record<WarehouseReportVariant, string> = {
  executive: "raport-wykonawczy",
  operations: "raport-operacyjny",
  technical: "raport-techniczny",
  product_locations: "raport-lokalizacji-produktow",
};

export function generateWarehouseReportPdf(variant: WarehouseReportVariant, ctx: WarehouseReportPdfContext): void {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  switch (variant) {
    case "executive":
      appendExecutiveWarehouseReport(pdf, ctx);
      break;
    case "operations":
      appendOperationsWarehouseReport(pdf, ctx);
      break;
    case "technical":
      appendTechnicalWarehouseReport(pdf, ctx);
      break;
    case "product_locations":
      appendOperationsWarehouseReport(pdf, ctx);
      break;
  }
  const base = (ctx.layout.name || "magazyn").replace(/\s+/g, "-");
  pdf.save(`${VARIANT_FILE[variant]}-${base}.pdf`);
}
