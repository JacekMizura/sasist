import { Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PdfReportData } from "../utils/pdfDataBuilder";
import { colors, S } from "../theme";
import { fmtM2, fmtM3 } from "../utils/format";
import { pdfNumFixed } from "../utils/safeText";

const styles = StyleSheet.create({
  wrap: { marginBottom: S[24] },
  title: { fontSize: 12, fontWeight: "bold", marginBottom: S[8], color: colors.text },
  line: { fontSize: 9, color: colors.muted, marginBottom: 4 },
});

type Props = { data: PdfReportData };

export function PdfBuildingFacts({ data }: Props) {
  const d = data.dimensions;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Budynek</Text>
      <Text style={styles.line}>
        Wymiary: {pdfNumFixed(d.widthM, 2)} × {pdfNumFixed(d.depthM, 2)} × {pdfNumFixed(d.heightM, 2)} m (szer. × gł. × wys.)
      </Text>
      <Text style={styles.line}>Powierzchnia: {fmtM2(data.surfaceM2)}</Text>
      <Text style={styles.line}>Kubatura: {fmtM3(data.buildingVolumeM3)}</Text>
    </View>
  );
}
