import { Font, pdf } from "@react-pdf/renderer";
import RobotoRegular from "./fonts/Roboto-Regular.ttf";
import RobotoBold from "./fonts/Roboto-Bold.ttf";
import { PDF_EMBED_ROBOTO } from "./pdfConfig";
import { WarehouseExecutiveReportPDF } from "./WarehouseExecutiveReportPDF";
import type { WarehouseExecutiveReportData } from "./utils/executiveReportDataBuilder";

let pdfFontsRegistered = false;

function registerPdfFonts(): void {
  if (!PDF_EMBED_ROBOTO) return;
  if (pdfFontsRegistered) return;
  Font.register({
    family: "Roboto",
    fonts: [
      { src: RobotoRegular, fontWeight: "normal" },
      { src: RobotoBold, fontWeight: "bold" },
    ],
  });
  pdfFontsRegistered = true;
}

export async function generateWarehouseExecutivePDF(data: WarehouseExecutiveReportData): Promise<void> {
  registerPdfFonts();
  const blob = await pdf(<WarehouseExecutiveReportPDF data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe =
    data.warehouseName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/gi, "") || "magazyn";
  a.download = `warehouse-executive-report-${safe}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
