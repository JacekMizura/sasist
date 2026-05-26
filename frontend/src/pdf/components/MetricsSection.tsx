import { Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PdfReportData } from "../utils/pdfDataBuilder";
import { colors, S } from "../theme";
import { fmtDm3 } from "../utils/format";
import { pdfInt } from "../utils/safeText";

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: "bold", marginBottom: S[16], color: colors.text },
  line: { fontSize: 10, marginBottom: S[8], color: colors.text },
  sub: { fontSize: 9, color: colors.muted, marginBottom: S[4] },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: S[8], paddingVertical: S[8], borderBottomWidth: 1, borderBottomColor: colors.border, borderBottomStyle: "solid" },
  tag: { fontSize: 9, fontWeight: "bold", color: colors.accent, width: "28%" },
  vals: { fontSize: 9, color: colors.text, width: "72%" },
});

type Props = { data: PdfReportData };

export function PdfMetricsSection({ data }: Props) {
  const { locations } = data;
  return (
    <View>
      <Text style={styles.title}>Objętość i typy lokalizacji</Text>
      <Text style={styles.line}>
        Pojemność całkowita (regały): {fmtDm3(data.totalVolume)}
      </Text>
      <Text style={styles.line}>Objętość zajęta: {fmtDm3(data.usedVolume)}</Text>
      <Text style={styles.line}>Objętość wolna: {fmtDm3(data.freeVolume)}</Text>
      <Text style={[styles.sub, { marginTop: S[16] }]}>Podział PRIMARY / RESERVE / DAMAGED</Text>
      <View style={styles.row}>
        <Text style={styles.tag}>PRIMARY</Text>
        <Text style={styles.vals}>
          {locations.primary.count} lokalizacji · {fmtDm3(locations.primary.volume)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.tag}>RESERVE</Text>
        <Text style={styles.vals}>
          {pdfInt(locations.reserve.count)} lokalizacji · {fmtDm3(locations.reserve.volume)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.tag}>DAMAGED</Text>
        <Text style={styles.vals}>
          {pdfInt(locations.damaged.count)} lokalizacji · {fmtDm3(locations.damaged.volume)}
        </Text>
      </View>
    </View>
  );
}
