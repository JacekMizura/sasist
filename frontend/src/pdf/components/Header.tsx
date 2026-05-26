import { Text, View, StyleSheet } from "@react-pdf/renderer";
import { colors, S } from "../theme";
import { pdfStr } from "../utils/safeText";

const styles = StyleSheet.create({
  wrap: { marginBottom: S[24] },
  title: { fontSize: 22, fontWeight: "bold", color: colors.text, marginBottom: S[8] },
  subtitle: { fontSize: 11, color: colors.muted },
  name: { fontSize: 13, color: colors.text, marginTop: S[8] },
});

type Props = { warehouseName: string; exportDate: string };

export function PdfHeader({ warehouseName, exportDate }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Raport magazynu</Text>
      <Text style={styles.subtitle}>{pdfStr(exportDate)}</Text>
      <Text style={styles.name}>{pdfStr(warehouseName)}</Text>
    </View>
  );
}
