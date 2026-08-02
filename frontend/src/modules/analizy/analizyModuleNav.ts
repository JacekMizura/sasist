/**
 * Wewnętrzna nawigacja hubu Analizy (IA):
 * Przegląd · Centrum operacyjne · Raporty · Optymalizacja
 * Routing pozostaje bez zmian — tylko warstwa nawigacji.
 */

export type AnalizyModuleSection = {
  id: "przeglad" | "centrum" | "raporty" | "optymalizacja";
  label: string;
  path: string;
};

/** Pierwszy raport w sekcji Raporty (wejście z zakładki sekcji). */
export const ANALIZY_REPORTS_ENTRY = "/analytics/inventory-value";

export const ANALIZY_MODULE_SECTIONS: AnalizyModuleSection[] = [
  { id: "przeglad", label: "Przegląd", path: "/analytics" },
  { id: "centrum", label: "Centrum operacyjne", path: "/centrum-operacyjne" },
  { id: "raporty", label: "Raporty", path: ANALIZY_REPORTS_ENTRY },
  { id: "optymalizacja", label: "Optymalizacja", path: "/optymalizacja" },
];

export function getActiveAnalizyModuleSection(
  pathname: string
): AnalizyModuleSection["id"] | null {
  if (pathname === "/centrum-operacyjne" || pathname.startsWith("/centrum-operacyjne/")) {
    return "centrum";
  }
  if (pathname === "/optymalizacja" || pathname.startsWith("/optymalizacja/")) {
    return "optymalizacja";
  }
  if (pathname === "/analytics" || pathname === "/analytics/dashboard") {
    return "przeglad";
  }
  if (pathname.startsWith("/analytics/")) {
    // Stare LIVE / ops — redirecty, ale gdyby coś zostało:
    if (
      pathname.startsWith("/analytics/warehouse-operations") ||
      pathname.startsWith("/analytics/live-warehouse")
    ) {
      return "centrum";
    }
    return "raporty";
  }
  return null;
}
