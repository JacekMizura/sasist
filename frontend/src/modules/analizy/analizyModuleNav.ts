/**
 * Wewnętrzna nawigacja hubu Analizy (IA):
 * Pulpit · Centrum operacyjne · Analizy · Optymalizacja
 * Routing pozostaje bez zmian — tylko warstwa nawigacji.
 */

export type AnalizyModuleSection = {
  id: "pulpit" | "centrum" | "analizy" | "optymalizacja";
  label: string;
  path: string;
};

/** Pierwszy raport w sekcji Analizy (wejście z zakładki sekcji). */
export const ANALIZY_REPORTS_ENTRY = "/analytics/inventory-value";

export const ANALIZY_MODULE_SECTIONS: AnalizyModuleSection[] = [
  { id: "pulpit", label: "Pulpit", path: "/analytics" },
  { id: "centrum", label: "Centrum operacyjne", path: "/centrum-operacyjne" },
  { id: "analizy", label: "Analizy", path: ANALIZY_REPORTS_ENTRY },
  { id: "optymalizacja", label: "Optymalizacja", path: "/optymalizacja" },
];

export function isAnalizyModulePath(pathname: string): boolean {
  if (pathname === "/analytics" || pathname.startsWith("/analytics/")) return true;
  if (pathname === "/centrum-operacyjne" || pathname.startsWith("/centrum-operacyjne/")) return true;
  if (pathname === "/optymalizacja" || pathname.startsWith("/optymalizacja/")) return true;
  return false;
}

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
    return "pulpit";
  }
  if (pathname.startsWith("/analytics/")) {
    // Stare LIVE / ops — redirecty, ale gdyby coś zostało:
    if (
      pathname.startsWith("/analytics/warehouse-operations") ||
      pathname.startsWith("/analytics/live-warehouse")
    ) {
      return "centrum";
    }
    return "analizy";
  }
  return null;
}
