/**
 * Jedyna mapa kolorów statusu reklamacji (lista, nagłówek szczegółów, kroki przebiegu).
 * Nie duplikuj klas Tailwind dla statusów poza tym obiektem.
 */
export const COMPLAINT_STATUS_STYLES = {
  NOWE: "bg-green-50 text-green-700 border-green-200",
  OCZEKIWANIE_NA_PRODUKT: "bg-amber-50 text-amber-900 border-amber-200",
  WERYFIKACJA: "bg-blue-50 text-blue-700 border-blue-200",
  DECYZJA: "bg-orange-50 text-orange-700 border-orange-200",
  ZAAKCEPTOWANA: "bg-green-100 text-green-800 border-green-300",
  ODRZUCONA: "bg-red-50 text-red-700 border-red-200",
} as const;

export type ComplaintStatusStyleCode = keyof typeof COMPLAINT_STATUS_STYLES;

/** Mocniejsza obwódka wybranego filtra — ta sama rodzina co {@link COMPLAINT_STATUS_STYLES}. */
const SIDEBAR_ACTIVE_BORDER: Record<ComplaintStatusStyleCode, string> = {
  NOWE: "border-2 border-green-500",
  OCZEKIWANIE_NA_PRODUKT: "border-2 border-amber-500",
  WERYFIKACJA: "border-2 border-blue-500",
  DECYZJA: "border-2 border-orange-500",
  ZAAKCEPTOWANA: "border-2 border-green-600",
  ODRZUCONA: "border-2 border-red-500",
};

const SIDEBAR_ROW_LAYOUT =
  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors";

/**
 * Przycisk filtra bocznego (1:1 kolory z badge / krokami szczegółów).
 * Wybrany: border-2 + ciemniejsza obwódka w tej samej palecie (bez niebieskiego „active” globalnego).
 */
export function complaintStatusSidebarFilterClass(code: ComplaintStatusStyleCode, selected: boolean): string {
  const palette = COMPLAINT_STATUS_STYLES[code];
  if (selected) {
    return `${SIDEBAR_ROW_LAYOUT} ${palette} ${SIDEBAR_ACTIVE_BORDER[code]} font-semibold shadow-sm`;
  }
  return `${SIDEBAR_ROW_LAYOUT} border ${palette} font-medium hover:brightness-[0.99]`;
}
