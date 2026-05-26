import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import RobotoRegular from "./fonts/Roboto-Regular.ttf";
import RobotoBold from "./fonts/Roboto-Bold.ttf";
import type { DamageReport } from "../types/damageReport";

let fontsRegistered = false;

function registerFonts(): void {
  if (fontsRegistered) return;
  Font.register({ family: "Roboto", src: RobotoRegular, fontWeight: "normal" });
  Font.register({ family: "Roboto", src: RobotoBold, fontWeight: "bold" });
  fontsRegistered = true;
}

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Roboto", fontSize: 10 },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  meta: { fontSize: 10, color: "#475569", marginBottom: 3 },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 6 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    borderBottomStyle: "solid",
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    borderBottomStyle: "solid",
    paddingVertical: 4,
  },
  hProd: { width: "27%", fontSize: 8, fontWeight: "bold" },
  hSku: { width: "12%", fontSize: 8, fontWeight: "bold" },
  hLoc: { width: "19%", fontSize: 8, fontWeight: "bold" },
  hQty: { width: "8%", fontSize: 8, fontWeight: "bold", textAlign: "right" },
  hPrice: { width: "16%", fontSize: 8, fontWeight: "bold", textAlign: "right" },
  hValue: { width: "18%", fontSize: 8, fontWeight: "bold", textAlign: "right" },
  cProd: { width: "27%", fontSize: 8 },
  cSku: { width: "12%", fontSize: 8 },
  cLoc: { width: "19%", fontSize: 8 },
  cQty: { width: "8%", fontSize: 8, textAlign: "right" },
  cPrice: { width: "16%", fontSize: 8, textAlign: "right" },
  cValue: { width: "18%", fontSize: 8, textAlign: "right" },
  detailsCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "solid",
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
  },
  detailsTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 2 },
  detailsLine: { fontSize: 8, color: "#334155" },
  summary: { fontSize: 12, fontWeight: "bold", marginTop: 4 },
  signatures: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  signatureBox: { width: "45%" },
  sigLine: { marginTop: 22, borderTopWidth: 1, borderTopColor: "#94a3b8", borderTopStyle: "solid" },
  sigLabel: { marginTop: 4, fontSize: 9, color: "#475569" },
});

function fmtPln(v: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(v);
}

function damageTypeLabel(v: string): string {
  if (v === "mechanical") return "Uszkodzenie mechaniczne";
  if (v === "missing_parts") return "Braki elementów";
  if (v === "flood") return "Zalanie";
  return "Inne";
}

function decisionLabel(v?: string | null): string {
  if (v === "SELLABLE") return "Sprzedaż";
  if (v === "REPAIR") return "Naprawa";
  if (v === "RETURN_TO_SUPPLIER") return "Zwrot do dostawcy";
  if (v === "DISPOSE") return "Utylizacja";
  return "—";
}

export async function generateDamageReportPDF(report: DamageReport): Promise<void> {
  registerFonts();
  const date = new Date(report.created_at).toLocaleString("pl-PL");
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>PROTOKÓŁ SZKODY</Text>
        <Text style={styles.meta}>Numer: {report.report_number}</Text>
        <Text style={styles.meta}>Data: {date}</Text>
        <Text style={styles.meta}>Magazyn: {report.warehouse_name ?? report.warehouse_id}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRODUKTY</Text>
          <View style={styles.headerRow}>
            <Text style={styles.hProd}>Produkt</Text>
            <Text style={styles.hSku}>SKU</Text>
            <Text style={styles.hLoc}>Lokalizacja</Text>
            <Text style={styles.hQty}>Ilość</Text>
            <Text style={styles.hPrice}>Cena zakupu</Text>
            <Text style={styles.hValue}>Wartość</Text>
          </View>
          {report.items.map((it) => (
            <View key={it.id} style={styles.row}>
              <Text style={styles.cProd}>{it.product_name}</Text>
              <Text style={styles.cSku}>{it.sku ?? "—"}</Text>
              <Text style={styles.cLoc}>{it.location_label ?? it.location_uuid}</Text>
              <Text style={styles.cQty}>{it.quantity}</Text>
              <Text style={styles.cPrice}>{fmtPln(it.purchase_price)}</Text>
              <Text style={styles.cValue}>{fmtPln(it.total_value)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SZCZEGÓŁY</Text>
          {report.items.map((it) => (
            <View key={`details-${it.id}`} style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>{it.product_name}</Text>
              <Text style={styles.detailsLine}>Typ szkody: {damageTypeLabel(it.damage_type)}</Text>
              <Text style={styles.detailsLine}>Decyzja: {decisionLabel(it.decision)}</Text>
              <Text style={styles.detailsLine}>Opis: {it.description?.trim() || "—"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PODSUMOWANIE</Text>
          <Text style={styles.summary}>Łączna wartość szkody: {fmtPln(report.total_value)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PODPISY</Text>
          <View style={styles.signatures}>
            <View style={styles.signatureBox}>
              <View style={styles.sigLine} />
              <Text style={styles.sigLabel}>zgłosił</Text>
            </View>
            <View style={styles.signatureBox}>
              <View style={styles.sigLine} />
              <Text style={styles.sigLabel}>zatwierdził</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );

  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `protokol-szkody-${report.report_number.replace(/[^\w-]/g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
