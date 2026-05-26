import { Font, pdf } from "@react-pdf/renderer";
import RobotoRegular from "./fonts/Roboto-Regular.ttf";
import RobotoBold from "./fonts/Roboto-Bold.ttf";
import { PDF_EMBED_ROBOTO } from "./pdfConfig";
import { WarehouseReportPDF } from "./WarehouseReportPDF";
import type { PdfReportData } from "./utils/pdfDataBuilder";

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

/**
 * Renders the warehouse report and triggers a browser download (Blob).
 */
export async function generateWarehousePDF(data: PdfReportData): Promise<void> {
  registerPdfFonts();
  const blob = await pdf(<WarehouseReportPDF data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = data.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/gi, "") || "magazyn";
  a.download = `raport-magazynu-${safe}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
