/**
 * Analytics module: top-level tabs and per-tab sub-navigation.
 * Pattern aligned with Wózki (Carts) module: one sidebar entry, tabs inside the page.
 */

export type AnalyticsTabId = "dashboard" | "analityka" | "symulacje" | "optymalizacja" | "mapy";

export type AnalyticsTab = {
  id: AnalyticsTabId;
  label: string;
  /** Path used for the tab link (first route in the group for non-dashboard). */
  path: string;
  /** Paths that make this tab active (pathname match). */
  activePaths: string[];
};

export type SubNavItem = { path: string; label: string };

export const ANALYTICS_TOP_TABS: AnalyticsTab[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/analytics/dashboard",
    activePaths: ["/analytics", "/analytics/dashboard"],
  },
  {
    id: "analityka",
    label: "Analityka",
    path: "/analytics/inventory-value",
    activePaths: [
      "/analytics/inventory-value",
      "/analytics/dead-stock",
      "/analytics/product-rotation",
      "/analytics/hot-products",
      "/analytics/product-affinity",
      "/analytics/walking-cost",
      "/analytics/hot-locations",
      "/analytics/pick-density",
      "/analytics/picking-analysis",
      "/analytics/sales-forecast",
      "/analytics/batch-picking",
    ],
  },
  {
    id: "symulacje",
    label: "Symulacje",
    path: "/analytics/pick-path-simulation",
    activePaths: [
      "/analytics/pick-path-simulation",
      "/analytics/warehouse-day-simulation",
      "/analytics/pick-time-simulation",
      "/analytics/worker-flow-simulation",
    ],
  },
  {
    id: "optymalizacja",
    label: "Optymalizacja",
    path: "/analytics/slotting",
    activePaths: [
      "/analytics/slotting",
      "/analytics/picking-strategy",
      "/analytics/layout-optimization",
      "/analytics/warehouse-throughput",
    ],
  },
  {
    id: "mapy",
    label: "Mapy",
    path: "/analytics/warehouse-map",
    activePaths: ["/analytics/warehouse-map", "/analytics/picking-issues-dead-stock"],
  },
];

export const ANALITYKA_SUB_NAV: SubNavItem[] = [
  { path: "/analytics/inventory-value", label: "Wartość magazynu" },
  { path: "/analytics/dead-stock", label: "Zalegający towar" },
  { path: "/analytics/product-rotation", label: "Rotacja produktów" },
  { path: "/analytics/hot-products", label: "Gorące produkty" },
  { path: "/analytics/product-affinity", label: "Produkty kupowane razem" },
  { path: "/analytics/walking-cost", label: "Koszt chodzenia" },
  { path: "/analytics/hot-locations", label: "Gorące lokalizacje" },
  { path: "/analytics/pick-density", label: "Gęstość kompletacji" },
  { path: "/analytics/picking-analysis", label: "Picking Analysis" },
  { path: "/analytics/sales-forecast", label: "Prognoza sprzedaży" },
  { path: "/analytics/batch-picking", label: "Batch picking" },
];

export const SYMULACJE_SUB_NAV: SubNavItem[] = [
  { path: "/analytics/pick-path-simulation", label: "Symulacja trasy" },
  { path: "/analytics/warehouse-day-simulation", label: "Symulacja dnia" },
  { path: "/analytics/pick-time-simulation", label: "Czas kompletacji" },
  { path: "/analytics/worker-flow-simulation", label: "Ruch magazynierów" },
];

export const OPTYMALIZACJA_SUB_NAV: SubNavItem[] = [
  { path: "/analytics/slotting", label: "Slotting" },
  { path: "/analytics/picking-strategy", label: "Strategia kompletacji" },
  { path: "/analytics/layout-optimization", label: "Optymalizacja layoutu" },
  { path: "/analytics/warehouse-throughput", label: "Przepustowość" },
];

export const MAPY_SUB_NAV: SubNavItem[] = [
  { path: "/analytics/warehouse-map", label: "Mapa magazynu" },
  { path: "/analytics/picking-issues-dead-stock", label: "Problemy kompletacji" },
];

export function getSubNavForPath(pathname: string): SubNavItem[] | null {
  if (ANALYTICS_TOP_TABS.find((t) => t.id === "analityka")!.activePaths.includes(pathname)) return ANALITYKA_SUB_NAV;
  if (ANALYTICS_TOP_TABS.find((t) => t.id === "symulacje")!.activePaths.includes(pathname)) return SYMULACJE_SUB_NAV;
  if (ANALYTICS_TOP_TABS.find((t) => t.id === "optymalizacja")!.activePaths.includes(pathname)) return OPTYMALIZACJA_SUB_NAV;
  if (ANALYTICS_TOP_TABS.find((t) => t.id === "mapy")!.activePaths.includes(pathname)) return MAPY_SUB_NAV;
  return null;
}
