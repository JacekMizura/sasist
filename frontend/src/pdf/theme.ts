import { StyleSheet } from "@react-pdf/renderer";
import { PDF_FONT_FAMILY } from "./pdfConfig";

export const PDF_PAD = 32;
export const S = { 4: 4, 8: 8, 16: 16, 24: 24, 32: 32 } as const;

export const colors = {
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  accent: "#0d9488",
  rackFill: "#cbd5e1",
  rackStroke: "#64748b",
  cardBg: "#f8fafc",
};

export const pdfStyles = StyleSheet.create({
  page: {
    padding: PDF_PAD,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 10,
    color: colors.text,
  },
  h1: { fontSize: 20, fontWeight: "bold", marginBottom: S[16], color: colors.text },
  h2: { fontSize: 14, fontWeight: "bold", marginBottom: S[16], color: colors.text },
  muted: { fontSize: 9, color: colors.muted },
  sectionGap: { marginTop: S[24] },
});
