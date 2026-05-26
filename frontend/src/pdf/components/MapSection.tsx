import { Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PdfReportData } from "../utils/pdfDataBuilder";
import { colors, S } from "../theme";
import { pdfStr } from "../utils/safeText";

const MAP_H = 260;

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: "bold", marginBottom: S[16], color: colors.text },
  caption: { fontSize: 8, color: colors.muted, marginTop: S[8] },
  canvas: {
    width: "100%",
    height: MAP_H,
    position: "relative",
    backgroundColor: "#f1f5f9",
    borderRadius: 4,
  },
  rack: {
    position: "absolute",
    backgroundColor: colors.rackFill,
    borderWidth: 0.5,
    borderColor: colors.rackStroke,
    borderStyle: "solid",
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
  },
  rackLabel: { fontSize: 6, color: colors.text, textAlign: "center" },
});

type Props = { map: PdfReportData["map"] };

export function PdfMapSection({ map }: Props) {
  const { gridCols, gridRows, racks } = map;
  const cols = Math.max(1, gridCols);
  const rows = Math.max(1, gridRows);

  return (
    <View>
      <Text style={styles.title}>Plan magazynu</Text>
      <View style={styles.canvas}>
        {racks.map((r, i) => {
          const left = (r.x / cols) * 100;
          const top = (r.y / rows) * 100;
          const w = (r.width / cols) * 100;
          const h = (r.height / rows) * 100;
          const short = r.label.length > 10 ? `${r.label.slice(0, 8)}…` : r.label;
          return (
            <View
              key={i}
              style={[
                styles.rack,
                {
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${w}%`,
                  height: `${h}%`,
                },
              ]}
            >
              <Text style={styles.rackLabel}>{short}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.caption}>
        Widok uproszczony (bez siatki edytora). Kolory neutralne — bez kodowania zajętości.
      </Text>
    </View>
  );
}
