/**
 * Stanowisko: Zarządzanie magazynem
 * Wejście: /zarzadzanie-magazynem
 * Sekcje: Pulpit · Raporty · Plan zmian
 */

export type ZarzadzanieModuleSection = {
  id: "pulpit" | "raporty" | "plan";
  label: string;
  path: string;
};

export const ZARZADZANIE_ROOT = "/zarzadzanie-magazynem";
export const PULPIT_KIEROWNIKA_PATH = `${ZARZADZANIE_ROOT}/pulpit`;
export const ZARZADZANIE_REPORTS_ENTRY = `${ZARZADZANIE_ROOT}/raporty`;
export const PLAN_ZMIAN_PATH = `${ZARZADZANIE_ROOT}/plan-zmian`;

/** Pierwszy raport po wejściu w Raporty. */
export const ZARZADZANIE_FIRST_REPORT = `${ZARZADZANIE_REPORTS_ENTRY}/inventory-value`;

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
    pathname === "/pulpit-kierownika" ||
    pathname === "/centrum-operacyjne" ||
    pathname.startsWith("/centrum-operacyjne/") ||
    pathname.startsWith("/wms/supply-flow") ||
    pathname.startsWith("/wms/operations")
  ) {
    return "pulpit";
  }
  if (
    pathname === PLAN_ZMIAN_PATH ||
    pathname.startsWith(`${PLAN_ZMIAN_PATH}/`) ||
    pathname === "/optymalizacja" ||
    pathname.startsWith("/optymalizacja/")
  ) {
    return "plan";
  }
  if (
    pathname === ZARZADZANIE_REPORTS_ENTRY ||
    pathname.startsWith(`${ZARZADZANIE_REPORTS_ENTRY}/`) ||
    pathname === "/analytics" ||
    pathname.startsWith("/analytics/")
  ) {
    if (
      pathname.startsWith("/analytics/warehouse-operations") ||
      pathname.startsWith("/analytics/live-warehouse")
    ) {
      return "pulpit";
    }
    return "raporty";
  }
  if (pathname === ZARZADZANIE_ROOT) return null;
  return null;
}

/** @deprecated alias */
export type AnalizyModuleSection = ZarzadzanieModuleSection;
export const ANALIZY_MODULE_SECTIONS = ZARZADZANIE_MODULE_SECTIONS;
export const ANALIZY_REPORTS_ENTRY = ZARZADZANIE_FIRST_REPORT;
export const getActiveAnalizyModuleSection = getActiveZarzadzanieModuleSection;
