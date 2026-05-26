import { Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PdfReportData } from "../utils/pdfDataBuilder";
import { colors, S } from "../theme";
import { pdfInt, pdfStr } from "../utils/safeText";

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: "bold", marginBottom: S[16], color: colors.text },
  block: { marginBottom: S[24], paddingBottom: S[16], borderBottomWidth: 1, borderBottomColor: colors.border, borderBottomStyle: "solid" },
  tplTitle: { fontSize: 11, fontWeight: "bold", marginBottom: S[8], color: colors.text },
  meta: { fontSize: 9, color: colors.muted, marginBottom: S[8] },
  gridRow: { flexDirection: "row", marginBottom: 4 },
  cell: {
    width: 14,
    height: 14,
    marginRight: 4,
    backgroundColor: "#475569",
    borderRadius: 2,
  },
});

type Props = { templates: PdfReportData["templates"] };

export function PdfTemplatesSection({ templates }: Props) {
  return (
    <View>
      <Text style={styles.title}>Szablony regałów</Text>
      {templates.map((t, idx) => (
        <View key={idx} style={styles.block} wrap={false}>
          <Text style={styles.tplTitle}>
            {pdfStr(t.name)} — {pdfStr(t.dimensionsLabel)}
          </Text>
          <Text style={styles.meta}>
            Regałów: {pdfInt(t.count)} · Lokacji: {pdfInt(t.totalLocations)}
            {t.templateId ? ` · ID: ${pdfStr(t.templateId)}` : ""}
          </Text>
          <Text style={{ fontSize: 8, color: colors.muted, marginBottom: S[8] }}>Układ poziomów (liczba lokacji na poziom):</Text>
          {t.levels.map((n, rowIdx) => (
            <View key={rowIdx} style={styles.gridRow}>
              {Array.from({ length: Math.min(n, 24) }, (_, j) => (
                <View key={j} style={styles.cell} />
              ))}
              {n > 24 ? (
                <Text style={{ fontSize: 8, color: colors.muted, marginLeft: 4 }}>+{n - 24}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
