/**
 * Sekcja Raporty — /zarzadzanie-magazynem/raporty/*
 * Index = Przegląd (AnalysisDashboard); pozostałe = lista analiz.
 */

import { ZARZADZANIE_REPORTS_ENTRY } from "../analizy/analizyModuleNav";

export type SubNavItem = { path: string; label: string };

/** Index + wszystkie istniejące raporty. */
export const ANALIZY_SUB_NAV: SubNavItem[] = [
  { path: ZARZADZANIE_REPORTS_ENTRY, label: "Przegląd" },
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

export function isAnalizyReportPath(pathname: string): boolean {
  return ANALIZY_REPORT_PATHS.has(pathname);
}

/** Top tabs zawsze gdy jesteśmy w Raportach (w tym na Przeglądzie). */
export function getAnalizySubNav(pathname: string): SubNavItem[] | null {
  if (
    pathname === ZARZADZANIE_REPORTS_ENTRY ||
    pathname.startsWith(`${ZARZADZANIE_REPORTS_ENTRY}/`)
  ) {
    return ANALIZY_SUB_NAV;
  }
  return isAnalizyReportPath(pathname) ? ANALIZY_SUB_NAV : null;
}
