import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import RobotoRegular from "./fonts/Roboto-Regular.ttf";
import RobotoBold from "./fonts/Roboto-Bold.ttf";
import type { LayoutState, WarehouseProduct } from "../types/warehouse";
import { buildWarehouseValueReportData } from "../reports/buildWarehouseValueReportData";

let pdfFontsRegistered = false;

function registerPdfFonts(): void {
  if (pdfFontsRegistered) return;
  Font.register({ family: "Roboto", src: RobotoRegular });
  Font.register({ family: "Roboto", src: RobotoBold, fontWeight: "bold" });
  pdfFontsRegistered = true;
}

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Roboto" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 6 },
  subtitle: { fontSize: 10, color: "#475569", marginBottom: 14 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 6 },
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 8, justifyContent: "space-between" },
  kpiCard: { borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "solid", borderRadius: 8, padding: 10, width: "32%" },
  kpiValue: { fontSize: 15, fontWeight: "bold" },
  kpiLabel: { fontSize: 9, color: "#64748b", marginTop: 2 },
  breakdownRow: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  breakdownCard: { borderWidth: 1, borderColor: "#e2e8f0", borderStyle: "solid", borderRadius: 8, padding: 10, width: "32%" },
  breakdownValue: { fontSize: 14, fontWeight: "bold" },
  breakdownLabel: { fontSize: 9, color: "#64748b", marginTop: 2 },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    borderBottomStyle: "solid",
    paddingBottom: 5,
    marginBottom: 2,
  },
  topHeaderLeft: { width: "50%", fontSize: 9, color: "#475569", fontWeight: "bold" },
  topHeaderMid: { width: "30%", fontSize: 9, color: "#475569", fontWeight: "bold", textAlign: "right" },
  topHeaderRight: { width: "20%", fontSize: 9, color: "#475569", fontWeight: "bold", textAlign: "right" },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    borderBottomStyle: "solid",
    paddingVertical: 5,
  },
  listLeft: { width: "50%", fontSize: 10 },
  listMid: { width: "30%", fontSize: 10, textAlign: "right" },
  listRight: { width: "20%", fontSize: 10, textAlign: "right" },
});

type GenerateWarehouseValueReportPdfInput = {
  products: WarehouseProduct[];
  layout: LayoutState;
  tenant_id: number;
  warehouse_id: number | null;
};

export async function generateWarehouseValueReportPDF(
  input: GenerateWarehouseValueReportPdfInput
): Promise<void> {
  registerPdfFonts();
  const data = buildWarehouseValueReportData({ products: input.products });
  const warehouseName = String(input.layout.warehouse_name ?? input.layout.name ?? "Magazyn").trim() || "Magazyn";
  const exportDate = new Date().toLocaleString("pl-PL");
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Raport wartości magazynu</Text>
        <Text style={styles.subtitle}>
          {warehouseName} • {exportDate} • tenant_id: {input.tenant_id}
          {input.warehouse_id != null ? ` • warehouse_id: ${input.warehouse_id}` : ""}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>KPI wartości</Text>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{data.totalWarehouseValueLabel}</Text>
              <Text style={styles.kpiLabel}>Całkowita wartość magazynu</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{String(data.totalProducts)}</Text>
              <Text style={styles.kpiLabel}>Liczba produktów</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{data.avgValuePerProductLabel}</Text>
              <Text style={styles.kpiLabel}>Średnia wartość</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Podział wartości wg stref</Text>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownValue}>{data.valueByStorageTypeLabel.primary}</Text>
              <Text style={styles.breakdownLabel}>Podstawowe</Text>
            </View>
            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownValue}>{data.valueByStorageTypeLabel.reserve}</Text>
              <Text style={styles.breakdownLabel}>Zapasowe</Text>
            </View>
            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownValue}>{data.valueByStorageTypeLabel.damaged}</Text>
              <Text style={styles.breakdownLabel}>Uszkodzone</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top 10 produktów wg wartości</Text>
          <View style={styles.topHeader}>
            <Text style={styles.topHeaderLeft}>Produkt</Text>
            <Text style={styles.topHeaderMid}>Wartość</Text>
            <Text style={styles.topHeaderRight}>Ilość</Text>
          </View>
          {data.topProducts.map((p, idx) => (
            <View key={p.productId} style={styles.listRow}>
              <Text style={styles.listLeft}>
                {idx + 1}. {p.name} ({p.sku})
              </Text>
              <Text style={styles.listMid}>{p.productValueLabel}</Text>
              <Text style={styles.listRight}>{p.totalQuantity} szt.</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );

  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = warehouseName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/gi, "") || "magazyn";
  a.download = `raport-wartosci-magazynu-${safe}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
