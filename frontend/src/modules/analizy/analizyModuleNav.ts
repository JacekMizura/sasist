/**
 * Nawigacja stanowiska: Zarządzanie magazynem
 * Pulpit kierownika · Raporty · Plan zmian
 */

export type ZarzadzanieModuleSection = {
  id: "pulpit" | "raporty" | "plan";
  label: string;
  path: string;
};

export const ZARZADZANIE_REPORTS_ENTRY = "/analytics/inventory-value";
export const PULPIT_KIEROWNIKA_PATH = "/pulpit-kierownika";
export const PLAN_ZMIAN_PATH = "/optymalizacja";

export const ZARZADZANIE_MODULE_SECTIONS: ZarzadzanieModuleSection[] = [
  { id: "pulpit", label: "Pulpit kierownika", path: PULPIT_KIEROWNIKA_PATH },
  { id: "raporty", label: "Raporty", path: ZARZADZANIE_REPORTS_ENTRY },
  { id: "plan", label: "Plan zmian", path: PLAN_ZMIAN_PATH },
];

export function getActiveZarzadzanieModuleSection(
  pathname: string,
): ZarzadzanieModuleSection["id"] | null {
  if (
    pathname === PULPIT_KIEROWNIKA_PATH ||
    pathname.startsWith(`${PULPIT_KIEROWNIKA_PATH}/`) ||
    pathname === "/centrum-operacyjne" ||
    pathname.startsWith("/centrum-operacyjne/") ||
    pathname === "/wms/supply-flow" ||
    pathname.startsWith("/wms/operations")
  ) {
    return "pulpit";
  }
  if (pathname === "/optymalizacja" || pathname.startsWith("/optymalizacja/")) {
    return "plan";
  }
  if (pathname === "/analytics" || pathname === "/analytics/dashboard") {
    return "raporty";
  }
  if (pathname.startsWith("/analytics/")) {
    if (
      pathname.startsWith("/analytics/warehouse-operations") ||
      pathname.startsWith("/analytics/live-warehouse")
    ) {
      return "pulpit";
    }
    return "raporty";
  }
  return null;
}

/** @deprecated alias — stara nazwa hubu Analizy */
export type AnalizyModuleSection = ZarzadzanieModuleSection;
export const ANALIZY_MODULE_SECTIONS = ZARZADZANIE_MODULE_SECTIONS;
export const ANALIZY_REPORTS_ENTRY = ZARZADZANIE_REPORTS_ENTRY;
export const getActiveAnalizyModuleSection = getActiveZarzadzanieModuleSection;
