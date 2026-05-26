/** Tagi wady — id muszą być spójne z backendem (zapis `defects_json`). */
export const COMPLAINT_DEFECT_TAG_OPTIONS: { id: string; label: string }[] = [
  { id: "transport", label: "Uszkodzenie transportu" },
  { id: "factory", label: "Wada fabryczna" },
  { id: "missing", label: "Brakująca część" },
  { id: "use", label: "Ślady użytkowania" },
  { id: "wrong", label: "Zły produkt" },
];

export function complaintDefectLabel(id: string): string {
  const row = COMPLAINT_DEFECT_TAG_OPTIONS.find((t) => t.id === id);
  return row?.label ?? id;
}
