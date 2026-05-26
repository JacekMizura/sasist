import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { fmtDm3, fmtPct, fmtPln } from "./utils/format";
import type { TopVolumeReportData } from "./utils/buildTopVolumeReportData";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, fontFamily: "Roboto", fontWeight: "normal" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 6 },
  subtitle: { fontSize: 10, color: "#64748b", marginBottom: 14 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 6 },
  insightsBox: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#dbeafe",
    borderRadius: 8,
    backgroundColor: "#f8fbff",
    padding: 9,
  },
  insightLine: { fontSize: 9, color: "#1e293b", marginBottom: 3 },
  kpiRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  kpiCard: {
    width: "24%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 9,
    backgroundColor: "#f8fafc",
  },
  kpiCardFive: {
    width: "19%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 9,
    backgroundColor: "#f8fafc",
  },
  kpiValue: { fontSize: 11, fontWeight: "bold" },
  kpiLabel: { fontSize: 8, color: "#64748b", marginTop: 2 },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#cbd5e1",
    paddingBottom: 5,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e2e8f0",
    paddingVertical: 7,
    alignItems: "center",
  },
  colName: { width: "27%", fontSize: 8.5, paddingRight: 6 },
  colVol: { width: "12%", fontSize: 8.5, textAlign: "right", paddingHorizontal: 3 },
  colQty: { width: "8%", fontSize: 8.5, textAlign: "right", paddingHorizontal: 3 },
  colLoc: { width: "10%", fontSize: 8.5, textAlign: "right", paddingHorizontal: 3 },
  colWeight: { width: "12%", fontSize: 8.5, textAlign: "right", paddingHorizontal: 3 },
  colValue: { width: "15%", fontSize: 8.5, textAlign: "right", paddingHorizontal: 3 },
  valueDensitySmall: { fontSize: 7, color: "#64748b", marginTop: 1, textAlign: "right" },
  colShare: { width: "16%", paddingLeft: 8 },
  headTxt: { fontSize: 8, fontWeight: "bold", color: "#475569" },
  barWrap: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
    marginBottom: 2,
  },
  barFill: { height: 6, backgroundColor: "#0ea5e9" },
  shareTxt: { fontSize: 7.5, color: "#334155", textAlign: "right" },
  problemCard: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#fee2e2",
    borderRadius: 8,
    backgroundColor: "#fff7ed",
    padding: 8,
    marginBottom: 6,
  },
  problemTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 2 },
  problemMeta: { fontSize: 8, color: "#7c2d12", marginBottom: 2 },
  bullet: { fontSize: 8, color: "#7c2d12", marginLeft: 8, marginBottom: 1 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 3 },
  problemBadge: {
    fontSize: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 4,
    marginBottom: 3,
    color: "#ffffff",
  },
  densityRed: { color: "#b91c1c" },
  densityOrange: { color: "#c2410c" },
  densityGreen: { color: "#15803d" },
});

function formatKg(v: number): string {
  return `${Number(v.toFixed(2)).toLocaleString("pl-PL")} kg`;
}

function formatDensity(v: number): string {
  const rounded = Number(v.toFixed(2));
  return `${rounded.toLocaleString("pl-PL")} zł/dm³`;
}

function nb(s: string): string {
  return s.replace(/ /g, "\u00A0");
}

function densityStyle(v: number) {
  if (v < 2) return styles.densityRed;
  if (v <= 5) return styles.densityOrange;
  return styles.densityGreen;
}

function problemBadgeStyle(label: string) {
  if (label === "Niska efektywność przestrzeni") return { ...styles.problemBadge, backgroundColor: "#dc2626" };
  if (label === "Duża objętość") return { ...styles.problemBadge, backgroundColor: "#ea580c" };
  return { ...styles.problemBadge, backgroundColor: "#7c3aed" };
}

export function TopVolumeReportPDF_v2(props: {
  warehouseName: string;
  tenantId: number;
  warehouseId: number | null;
  generatedAt: string;
  data: TopVolumeReportData;
}) {
  const { warehouseName, tenantId, warehouseId, generatedAt, data } = props;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text>DEBUG_VERSION_2</Text>
        <Text style={styles.title}>Największe produkty (TOP 10)</Text>
        <Text style={styles.subtitle}>
          {warehouseName} • {generatedAt} • tenant_id: {tenantId}
          {warehouseId != null ? ` • warehouse_id: ${warehouseId}` : ""}
        </Text>

        <View style={styles.section}>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{nb(fmtDm3(data.totalWarehouseVolume))}</Text>
              <Text style={styles.kpiLabel}>Całkowita objętość</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{nb(formatKg(data.totalWeightAll))}</Text>
              <Text style={styles.kpiLabel}>Całkowita waga</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{nb(fmtDm3(data.avgVolumePerProduct))}</Text>
              <Text style={styles.kpiLabel}>Średnia objętość / produkt</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{nb(fmtPct(data.top1SharePercent))}</Text>
              <Text style={styles.kpiLabel}>Udział TOP 1</Text>
            </View>
          </View>
          <View style={styles.kpiRow}>
            <View style={styles.kpiCardFive}>
              <Text style={styles.kpiValue}>{nb(fmtDm3(data.top10Volume))}</Text>
              <Text style={styles.kpiLabel}>Objętość TOP 10</Text>
            </View>
            <View style={styles.kpiCardFive}>
              <Text style={styles.kpiValue}>{nb(fmtPct(data.top10SharePercent))}</Text>
              <Text style={styles.kpiLabel}>Udział TOP 10</Text>
            </View>
            <View style={styles.kpiCardFive}>
              <Text style={styles.kpiValue}>{nb(fmtPct(data.top3SharePercent))}</Text>
              <Text style={styles.kpiLabel}>Udział TOP 3</Text>
            </View>
            <View style={styles.kpiCardFive}>
              <Text style={styles.kpiValue}>{nb(formatKg(data.heaviestProductWeight))}</Text>
              <Text style={styles.kpiLabel}>Najcięższy produkt (kg)</Text>
            </View>
            <View style={styles.kpiCardFive}>
              <Text style={styles.kpiValue}>{String(data.totalProducts)}</Text>
              <Text style={styles.kpiLabel}>Produkty z lokalizacjami</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wnioski</Text>
          <View style={styles.insightsBox}>
            <Text style={styles.insightLine}>- TOP 1 odpowiada za {nb(fmtPct(data.top1SharePercent))} całkowitej objętości magazynu.</Text>
            <Text style={styles.insightLine}>- TOP 3 odpowiadają za {nb(fmtPct(data.top3SharePercent))} całkowitej objętości.</Text>
            <Text style={styles.insightLine}>- Produkty o zerowej wartości: {data.zeroValueProductsCount}.</Text>
            <Text style={styles.insightLine}>
              - Koncentracja: {data.highConcentration ? "Wysoka koncentracja wolumenu w TOP 1." : "Brak silnej koncentracji w TOP 1."}
            </Text>
            <Text style={[styles.insightLine, { marginBottom: 0 }]}>
              - Najcięższy produkt: {data.heaviestProductName} ({nb(formatKg(data.heaviestProductWeight))}).
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.headRow}>
            <Text style={[styles.colName, styles.headTxt]}>Produkt</Text>
            <Text style={[styles.colVol, styles.headTxt]}>Objętość</Text>
            <Text style={[styles.colQty, styles.headTxt]}>Ilość</Text>
            <Text style={[styles.colLoc, styles.headTxt]}>Lokalizacje</Text>
            <Text style={[styles.colWeight, styles.headTxt]}>Waga (kg)</Text>
            <Text style={[styles.colValue, styles.headTxt]}>Wartość (zł)</Text>
            <Text style={[styles.colShare, styles.headTxt]}>Udział (%)</Text>
          </View>

          {data.topProducts.map((p) => {
            return (
              <View key={p.productId} style={styles.row}>
                <View style={styles.colName}>
                  <Text numberOfLines={2}>
                    {p.name}
                  </Text>
                </View>
                <Text style={styles.colVol}>{nb(fmtDm3(p.totalVolume))}</Text>
                <Text style={styles.colQty}>{p.totalQuantity}</Text>
                <Text style={styles.colLoc}>{p.locationCount}</Text>
                <Text style={styles.colWeight}>{nb(formatKg(p.totalWeight))}</Text>
                <View style={styles.colValue}>
                  <Text style={{ textAlign: "right" }}>{nb(fmtPln(p.totalValue))}</Text>
                  <Text style={[styles.valueDensitySmall, densityStyle(p.valueDensity)]}>{nb(formatDensity(p.valueDensity))}</Text>
                </View>
                <View style={styles.colShare}>
                  <View style={styles.barWrap}>
                    <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, p.sharePercent))}%` }]} />
                  </View>
                  <Text style={styles.shareTxt}>{nb(fmtPct(p.sharePercent))}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Problematyczne produkty</Text>
          {data.problematicProducts.length === 0 ? (
            <Text style={{ fontSize: 9, color: "#64748b" }}>Brak wykrytych produktów problematycznych według zdefiniowanych kryteriów.</Text>
          ) : (
            data.problematicProducts.map((p) => (
              <View key={`problem-${p.productId}`} style={styles.problemCard}>
                <Text style={styles.problemTitle}>{p.name}</Text>
                <View style={styles.badgeRow}>
                  {p.problemTypes.map((t) => (
                    <Text key={`${p.productId}-${t}`} style={problemBadgeStyle(t)}>
                      {t}
                    </Text>
                  ))}
                </View>
                <Text style={styles.problemMeta}>Powód:</Text>
                <Text style={styles.bullet}>- {p.reason}</Text>
                <Text style={styles.bullet}>- Objętość: {nb(fmtDm3(p.totalVolume))}</Text>
                <Text style={styles.bullet}>- Wartość: {nb(fmtPln(p.totalValue))}</Text>
                <Text style={styles.bullet}>- Lokalizacje: {p.locationCount}</Text>
              </View>
            ))
          )}
        </View>
      </Page>
    </Document>
  );
}
