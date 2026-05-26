import { Font, pdf } from "@react-pdf/renderer";
import RobotoRegular from "./fonts/Roboto-Regular.ttf";
import RobotoBold from "./fonts/Roboto-Bold.ttf";
import type { LayoutState, WarehouseProduct } from "../types/warehouse";
import { buildTopVolumeReportData } from "./utils/buildTopVolumeReportData";
import { TopVolumeReportPDF_v2 } from "./TopVolumeReportPDF";

let fontsRegistered = false;

function registerFonts(): void {
  if (fontsRegistered) return;
  Font.register({ family: "Roboto", src: RobotoRegular, fontWeight: "normal" });
  Font.register({ family: "Roboto", src: RobotoBold, fontWeight: "bold" });
  fontsRegistered = true;
}

type GenerateTopVolumeReportPdfInput = {
  products: WarehouseProduct[];
  layout: LayoutState;
  warehouseId: number | null;
  tenantId: number;
};

export async function generateTopVolumeReportPDF(input: GenerateTopVolumeReportPdfInput): Promise<void> {
  console.log("TOP_VOLUME_RENDER_V2");
  registerFonts();
  const data = buildTopVolumeReportData({ products: input.products });
  const warehouseName = String(input.layout.warehouse_name ?? input.layout.name ?? "Magazyn").trim() || "Magazyn";

  const doc = <TopVolumeReportPDF_v2 warehouseName={warehouseName} tenantId={input.tenantId} warehouseId={input.warehouseId} generatedAt={new Date().toLocaleString("pl-PL")} data={data} />;

  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = warehouseName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/gi, "") || "magazyn";
  a.download = `top-10-objetosc-${safe}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
