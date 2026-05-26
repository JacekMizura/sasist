import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { colors, pdfStyles, S } from "./theme";
import type { WarehouseExecutiveReportData } from "./utils/executiveReportDataBuilder";
import { fmtDm3, fmtPct, fmtPln } from "./utils/format";

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "bold", color: colors.text, marginBottom: S[8] },
  subtitle: { fontSize: 11, color: colors.muted, marginBottom: S[24] },
  sectionTitle: { fontSize: 15, fontWeight: "bold", color: colors.text, marginBottom: S[16] },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: S[16] },
  kpiCard: {
    width: "48%",
    padding: S[16],
    marginBottom: S[16],
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "solid",
    borderRadius: 6,
  },
  kpiValue: { fontSize: 20, fontWeight: "bold", color: colors.text, marginBottom: S[4] },
  kpiLabel: { fontSize: 10, color: colors.muted },
  paragraph: { fontSize: 11, color: colors.text, lineHeight: 1.5, marginBottom: S[8] },
  listItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: S[8],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderBottomStyle: "solid",
  },
  itemName: { width: "58%", fontSize: 11, color: colors.text },
  itemValue: { width: "22%", fontSize: 11, color: colors.text, textAlign: "right" },
  itemShare: { width: "20%", fontSize: 10, color: colors.muted, textAlign: "right" },
  note: { fontSize: 10, color: colors.muted, marginTop: S[16] },
  usageRow: {
    marginBottom: S[12],
    paddingBottom: S[8],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderBottomStyle: "solid",
  },
  usageHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: S[4] },
  usageLabel: { fontSize: 11, fontWeight: "bold", color: colors.text },
  usagePct: { fontSize: 11, fontWeight: "bold", color: colors.text },
  usageSub: { fontSize: 10, color: colors.muted },
  issueCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "solid",
    borderRadius: 6,
    padding: S[16],
    marginBottom: S[12],
  },
  issueTitle: { fontSize: 12, fontWeight: "bold", color: colors.text, marginBottom: S[4] },
  issueText: { fontSize: 10, color: colors.text, lineHeight: 1.4, marginBottom: S[4] },
  mismatchCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "solid",
    borderRadius: 6,
    padding: S[12],
    marginTop: S[12],
  },
  mismatchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: S[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderBottomStyle: "solid",
  },
  mismatchName: { width: "42%", fontSize: 10, color: colors.text },
  mismatchQty: { width: "19%", fontSize: 10, color: colors.text, textAlign: "right" },
});

export type WarehouseExecutiveReportPDFProps = {
  data: WarehouseExecutiveReportData;
};

export function WarehouseExecutiveReportPDF({ data }: WarehouseExecutiveReportPDFProps) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <Text style={styles.title}>Warehouse Executive Report</Text>
        <Text style={styles.subtitle}>
          {data.warehouseName} • {data.exportDate}
        </Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{fmtPln(data.totalInventoryValuePln)}</Text>
            <Text style={styles.kpiLabel}>Wartość zapasu</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{fmtPct(data.occupancyPct)}</Text>
            <Text style={styles.kpiLabel}>Zajętość</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{fmtPct(data.freeSpacePct)}</Text>
            <Text style={styles.kpiLabel}>Wolna przestrzeń</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{String(data.productCount)}</Text>
            <Text style={styles.kpiLabel}>Produkty z wartością w magazynie</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{data.quantityReconciliation.mismatchCount}</Text>
            <Text style={styles.kpiLabel}>Rozbieżności expected vs actual</Text>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Wnioski zarządcze</Text>
        {data.insights.map((line, i) => (
          <Text key={i} style={styles.paragraph}>
            {line}
          </Text>
        ))}
      </Page>

      <Page size="A4" style={pdfStyles.page}>
        <Text style={styles.sectionTitle}>Wartość zapasu</Text>
        {data.topProductsByValue.map((item, idx) => (
          <View key={item.productId} style={styles.listItem}>
            <Text style={styles.itemName}>
              {idx + 1}. {item.name}
            </Text>
            <Text style={styles.itemValue}>{fmtPln(item.valuePln)}</Text>
            <Text style={styles.itemShare}>{fmtPct(item.sharePct)}</Text>
          </View>
        ))}
        <Text style={styles.note}>Top 5 odpowiada za {fmtPct(data.top5SharePct)} całkowitej wartości zapasu.</Text>
      </Page>

      <Page size="A4" style={pdfStyles.page}>
        <Text style={styles.sectionTitle}>Wykorzystanie pojemności</Text>
        <Text style={styles.paragraph}>
          Zajęta przestrzeń: {fmtDm3(data.occupancyBreakdown.usedDm3)} z {fmtDm3(data.occupancyBreakdown.totalDm3)}.
        </Text>
        <Text style={styles.paragraph}>Wolna przestrzeń: {fmtDm3(data.occupancyBreakdown.freeDm3)}.</Text>
        <Text style={[styles.sectionTitle, { marginTop: S[16] }]}>Wykorzystanie stref</Text>
        {data.storageUsage.map((s) => (
          <View key={s.key} style={styles.usageRow}>
            <View style={styles.usageHead}>
              <Text style={styles.usageLabel}>{s.label}</Text>
              <Text style={styles.usagePct}>{fmtPct(s.utilizationPct)}</Text>
            </View>
            <Text style={styles.usageSub}>
              {fmtDm3(s.usedDm3)} / {fmtDm3(s.capacityDm3)}
            </Text>
          </View>
        ))}
      </Page>

      <Page size="A4" style={pdfStyles.page}>
        <Text style={styles.sectionTitle}>Priorytetowe obszary decyzji</Text>
        <Text style={styles.paragraph}>
          Porównanie ilości: expected (product.quantity) vs actual (SUM inventory.quantity).
        </Text>
        <Text style={styles.paragraph}>
          Expected: {data.quantityReconciliation.expectedQuantityTotal.toFixed(2)} · Actual:{" "}
          {data.quantityReconciliation.actualQuantityTotal.toFixed(2)} · Delta:{" "}
          {data.quantityReconciliation.differenceTotal >= 0 ? "+" : ""}
          {data.quantityReconciliation.differenceTotal.toFixed(2)}
        </Text>
        {data.issues.map((issue, idx) => (
          <View key={idx} style={styles.issueCard}>
            <Text style={styles.issueTitle}>{issue.title}</Text>
            <Text style={styles.issueText}>Wpływ: {issue.impact}</Text>
            <Text style={styles.issueText}>Rekomendacja: {issue.recommendation}</Text>
          </View>
        ))}
        <View style={styles.mismatchCard}>
          <Text style={styles.issueTitle}>Top rozbieżności ilości</Text>
          {data.quantityReconciliation.topMismatches.length === 0 ? (
            <Text style={styles.issueText}>Brak istotnych rozbieżności expected vs actual.</Text>
          ) : (
            <>
              {data.quantityReconciliation.topMismatches.map((m) => (
                <View key={m.productId} style={styles.mismatchRow}>
                  <Text style={styles.mismatchName}>{m.name}</Text>
                  <Text style={styles.mismatchQty}>{m.expectedQuantity.toFixed(2)}</Text>
                  <Text style={styles.mismatchQty}>{m.actualQuantity.toFixed(2)}</Text>
                  <Text style={styles.mismatchQty}>
                    {m.difference >= 0 ? "+" : ""}
                    {m.difference.toFixed(2)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      </Page>
    </Document>
  );
}
