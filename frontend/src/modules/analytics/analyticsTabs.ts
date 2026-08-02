/**
 * Sekcja raportów w hubie Analizy (podzakładka „Analizy”).
 * Landing hubu = Pulpit (/analytics) — bez bocznego menu raportów.
 */

export type SubNavItem = { path: string; label: string };

/** Raporty w hubie Analizy. Etykiety PL — język biznesowy, bez skrótów. */
export const ANALIZY_SUB_NAV: SubNavItem[] = [
  { path: "/analytics/inventory-value", label: "Wartość zapasów" },
  { path: "/analytics/dead-stock", label: "Zalegający towar" },
  { path: "/analytics/hot-products", label: "Najczęściej sprzedawane produkty" },
  { path: "/analytics/product-affinity", label: "Produkty zamawiane razem" },
  { path: "/analytics/hot-locations", label: "Najczęściej odwiedzane lokalizacje" },
  { path: "/analytics/picking-analysis", label: "Jak przebiega kompletacja" },
  { path: "/analytics/sales-forecast", label: "Prognoza sprzedaży" },
  { path: "/analytics/bundle-intelligence", label: "Zestawy produktów" },
];

const ANALIZY_REPORT_PATHS = new Set(ANALIZY_SUB_NAV.map((i) => i.path));

/** True when user is on a report (show side sub-nav). Landing = no sub-nav. */
export function isAnalizyReportPath(pathname: string): boolean {
  return ANALIZY_REPORT_PATHS.has(pathname);
}

export function getAnalizySubNav(pathname: string): SubNavItem[] | null {
  return isAnalizyReportPath(pathname) ? ANALIZY_SUB_NAV : null;
}

/** @deprecated Use ANALIZY_SUB_NAV / getAnalizySubNav — Faza 1 removed top tabs. */
export const ANALITYKA_SUB_NAV = ANALIZY_SUB_NAV;
export function getSubNavForPath(pathname: string): SubNavItem[] | null {
  return getAnalizySubNav(pathname);
}
