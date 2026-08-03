/**
 * Sekcja Raporty w Zarządzaniu magazynem.
 * Canonical: /zarzadzanie-magazynem/raporty/*
 */

import { ZARZADZANIE_REPORTS_ENTRY } from "../analizy/analizyModuleNav";

export type SubNavItem = { path: string; label: string };

/** Raporty historyczne. Etykiety PL — język biznesowy, bez skrótów. */
export const ANALIZY_SUB_NAV: SubNavItem[] = [
  { path: `${ZARZADZANIE_REPORTS_ENTRY}/inventory-value`, label: "Wartość zapasów" },
  { path: `${ZARZADZANIE_REPORTS_ENTRY}/dead-stock`, label: "Zalegający towar" },
  { path: `${ZARZADZANIE_REPORTS_ENTRY}/hot-products`, label: "Najczęściej sprzedawane produkty" },
  { path: `${ZARZADZANIE_REPORTS_ENTRY}/product-affinity`, label: "Produkty zamawiane razem" },
  { path: `${ZARZADZANIE_REPORTS_ENTRY}/hot-locations`, label: "Najczęściej odwiedzane lokalizacje" },
  { path: `${ZARZADZANIE_REPORTS_ENTRY}/picking-analysis`, label: "Jak przebiega kompletacja" },
  { path: `${ZARZADZANIE_REPORTS_ENTRY}/sales-forecast`, label: "Prognoza sprzedaży" },
  { path: `${ZARZADZANIE_REPORTS_ENTRY}/bundle-intelligence`, label: "Zestawy produktów" },
  { path: `${ZARZADZANIE_REPORTS_ENTRY}/warehouse-map`, label: "Mapa magazynu" },
];

const ANALIZY_REPORT_PATHS = new Set(ANALIZY_SUB_NAV.map((i) => i.path));

/** True when user is on a report (show side sub-nav). */
export function isAnalizyReportPath(pathname: string): boolean {
  return ANALIZY_REPORT_PATHS.has(pathname);
}

export function getAnalizySubNav(pathname: string): SubNavItem[] | null {
  return isAnalizyReportPath(pathname) ? ANALIZY_SUB_NAV : null;
}
