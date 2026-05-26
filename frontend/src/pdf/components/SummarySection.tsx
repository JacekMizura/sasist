import { Text, View, StyleSheet } from "@react-pdf/renderer";
import { colors, S } from "../theme";
import { fmtDm3, fmtPct, fmtPln } from "../utils/format";
import { pdfInt } from "../utils/safeText";

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: "bold", marginBottom: S[16], color: colors.text },
  row: { flexDirection: "row", flexWrap: "wrap" },
  card: {
    width: "47%",
    marginRight: "3%",
    marginBottom: S[16],
    backgroundColor: colors.cardBg,
    padding: S[16],
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderLeftStyle: "solid",
  },
  big: { fontSize: 22, fontWeight: "bold", color: colors.text, marginBottom: S[8] },
  label: { fontSize: 9, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
});

type Props = {
  occupancyPercent: number;
  totalLocations: number;
  usedVolume: number;
  warehouseValue: number;
};

export function PdfSummarySection({ occupancyPercent, totalLocations, usedVolume, warehouseValue }: Props) {
  return (
    <View>
      <Text style={styles.title}>Podsumowanie</Text>
      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.label}>Zajętość</Text>
          <Text style={styles.big}>{fmtPct(occupancyPercent)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Lokalizacje (wszystkie sloty)</Text>
          <Text style={styles.big}>{pdfInt(totalLocations)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Wykorzystana objętość</Text>
          <Text style={styles.big}>{fmtDm3(usedVolume)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Wartość zapasów (lokacje)</Text>
          <Text style={styles.big}>{fmtPln(warehouseValue)}</Text>
        </View>
      </View>
    </View>
  );
}
