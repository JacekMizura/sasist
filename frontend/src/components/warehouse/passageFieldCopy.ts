/**
 * Shared Polish labels + hints for rack passage geometry fields.
 */

export const PASSAGE_FIELD_LABELS = {
  offset: "Początek od lewej krawędzi",
  width: "Szerokość przejazdu",
  clearance: "Wysokość wolnej przestrzeni",
} as const;

export const PASSAGE_FIELD_HINTS = {
  offset: "Odległość od lewej krawędzi regału do początku przejazdu wzdłuż szerokości (cm).",
  width: "Szerokość otworu przejazdu wzdłuż szerokości regału (cm). Przejazd zawsze obejmuje całą głębokość.",
  clearance:
    "Wysokość od posadzki bez półek i lokalizacji. Decyduje, ile dolnych poziomów konstrukcyjnych zostanie wyłączonych z magazynu.",
} as const;

export function passageFieldLabel(key: keyof typeof PASSAGE_FIELD_LABELS, withUnit = true): string {
  const base = PASSAGE_FIELD_LABELS[key];
  return withUnit ? `${base} (cm)` : base;
}
