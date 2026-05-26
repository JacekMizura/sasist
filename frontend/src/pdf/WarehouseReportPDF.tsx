import { Document, Page } from "@react-pdf/renderer";
import type { PdfReportData } from "./utils/pdfDataBuilder";
import { pdfStyles } from "./theme";
import { PdfHeader } from "./components/Header";
import { PdfBuildingFacts } from "./components/BuildingFacts";
import { PdfSummarySection } from "./components/SummarySection";
import { PdfMapSection } from "./components/MapSection";
import { PdfTemplatesSection } from "./components/TemplatesSection";
import { PdfMetricsSection } from "./components/MetricsSection";

export type WarehouseReportPDFProps = { data: PdfReportData };

export function WarehouseReportPDF({ data }: WarehouseReportPDFProps) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader warehouseName={data.name} exportDate={data.date} />
        <PdfBuildingFacts data={data} />
        <PdfSummarySection
          occupancyPercent={data.occupancyPercent}
          totalLocations={data.totalLocations}
          usedVolume={data.usedVolume}
          warehouseValue={data.warehouseValue}
        />
      </Page>
      <Page size="A4" style={pdfStyles.page}>
        <PdfMapSection map={data.map} />
      </Page>
      <Page size="A4" style={pdfStyles.page}>
        <PdfTemplatesSection templates={data.templates} />
      </Page>
      <Page size="A4" style={pdfStyles.page}>
        <PdfMetricsSection data={data} />
      </Page>
    </Document>
  );
}
