/**
 * Canonical WMS module registry — dashboard tiles, top navigation, pinned modes,
 * semantic accents, RBAC operationalMode keys.
 *
 * MODULE REGISTRY SSOT → Dashboard ∩ Topbar (permissions ∩ pinning ∩ order).
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ClipboardList,
  Factory,
  Inbox,
  LayoutGrid,
  ListChecks,
  Package,
  PackageCheck,
  ScanSearch,
  ShoppingCart,
  Undo2,
  Warehouse,
} from "lucide-react";

export type WmsTabId =
  | "returns"
  | "receiving"
  | "putaway"
  | "mm"
  | "consolidations"
  | "consolidation_racks"
  | "picking"
  | "product_preview"
  | "packing"
  | "issues"
  | "direct_sales"
  | "operations"
  | "production"
  | "inventory_count";

/** Backend ``wms_operational_modes`` key; omit = always visible (no mode gate). */
export type WmsOperationalModeKey = string;

export type WmsDashboardCategory = "daily" | "control" | "other";

export type WmsModuleAccent = {
  iconBg: string;
  iconRing: string;
  iconText: string;
  hoverBorder: string;
  hoverShadow: string;
};

export type WmsModuleDefinition = {
  id: WmsTabId;
  path: string;
  label: string;
  icon: LucideIcon;
  /** Sort order on WMS dashboard tile grid (lower = earlier). */
  sortOrder: number;
  /** Show as a tile on /wms/menu dashboard. */
  dashboard: boolean;
  /** When set, user must have this mode in ``wms_operational_modes`` (if list is non-empty). */
  operationalMode?: WmsOperationalModeKey;
  shortDescription?: string;
  /** Semantic color for dashboard tile + topbar icon. */
  accent: WmsModuleAccent;
  /** Dashboard section grouping. */
  dashboardCategory: WmsDashboardCategory;
  /** Eligible for topbar pin configuration. */
  canPin: boolean;
  /** Optional badge/count provider key used by launcher KPI hooks. */
  badgeProvider?: "issues" | "operations_snapshot" | "inventory" | "consolidations";
};

export type WmsTabConfigItem = Pick<WmsModuleDefinition, "id" | "path" | "label" | "icon">;

export const WMS_MODULE_ACCENT_DEFAULT: WmsModuleAccent = {
  iconBg: "bg-indigo-50",
  iconRing: "ring-indigo-100",
  iconText: "text-indigo-600",
  hoverBorder: "hover:border-indigo-200",
  hoverShadow: "hover:shadow-indigo-100/80",
};

/** Default topbar pins when user has no saved preferences (filtered by permissions). */
export const DEFAULT_WMS_TOPBAR_PIN_IDS: readonly WmsTabId[] = [
  "receiving",
  "putaway",
  "picking",
  "packing",
  "issues",
] as const;

const A = {
  emerald: {
    iconBg: "bg-emerald-50",
    iconRing: "ring-emerald-100",
    iconText: "text-emerald-600",
    hoverBorder: "hover:border-emerald-200",
    hoverShadow: "hover:shadow-emerald-100/80",
  },
  blue: {
    iconBg: "bg-blue-50",
    iconRing: "ring-blue-100",
    iconText: "text-blue-600",
    hoverBorder: "hover:border-blue-200",
    hoverShadow: "hover:shadow-blue-100/80",
  },
  orange: {
    iconBg: "bg-orange-50",
    iconRing: "ring-orange-100",
    iconText: "text-orange-600",
    hoverBorder: "hover:border-orange-200",
    hoverShadow: "hover:shadow-orange-100/80",
  },
  violet: {
    iconBg: "bg-violet-50",
    iconRing: "ring-violet-100",
    iconText: "text-violet-600",
    hoverBorder: "hover:border-violet-200",
    hoverShadow: "hover:shadow-violet-100/80",
  },
  red: {
    iconBg: "bg-red-50",
    iconRing: "ring-red-100",
    iconText: "text-red-600",
    hoverBorder: "hover:border-red-200",
    hoverShadow: "hover:shadow-red-100/80",
  },
  teal: {
    iconBg: "bg-teal-50",
    iconRing: "ring-teal-100",
    iconText: "text-teal-600",
    hoverBorder: "hover:border-teal-200",
    hoverShadow: "hover:shadow-teal-100/80",
  },
  sky: {
    iconBg: "bg-sky-50",
    iconRing: "ring-sky-100",
    iconText: "text-sky-600",
    hoverBorder: "hover:border-sky-200",
    hoverShadow: "hover:shadow-sky-100/80",
  },
  purple: {
    iconBg: "bg-purple-50",
    iconRing: "ring-purple-100",
    iconText: "text-purple-600",
    hoverBorder: "hover:border-purple-200",
    hoverShadow: "hover:shadow-purple-100/80",
  },
  rose: {
    iconBg: "bg-rose-50",
    iconRing: "ring-rose-100",
    iconText: "text-rose-600",
    hoverBorder: "hover:border-rose-200",
    hoverShadow: "hover:shadow-rose-100/80",
  },
} as const satisfies Record<string, WmsModuleAccent>;

/** Single source of truth for all WMS modules. */
export const WMS_MODULES: WmsModuleDefinition[] = [
  {
    id: "returns",
    path: "/wms/returns",
    label: "Zwroty / Reklamacje",
    icon: Undo2,
    sortOrder: 10,
    dashboard: true,
    operationalMode: "returns",
    shortDescription: "Zwroty i reklamacje",
    accent: A.violet,
    dashboardCategory: "other",
    canPin: true,
  },
  {
    id: "receiving",
    path: "/wms/receiving",
    label: "Przyjęcie",
    icon: Inbox,
    sortOrder: 20,
    dashboard: true,
    operationalMode: "receiving",
    shortDescription: "Przyjęcia PZ",
    accent: A.emerald,
    dashboardCategory: "daily",
    canPin: true,
    badgeProvider: "operations_snapshot",
  },
  {
    id: "putaway",
    path: "/wms/putaway",
    label: "Rozlokowanie PZ",
    icon: Warehouse,
    sortOrder: 30,
    dashboard: true,
    operationalMode: "putaway",
    shortDescription: "Rozlokowanie po PZ",
    accent: A.orange,
    dashboardCategory: "daily",
    canPin: true,
    badgeProvider: "operations_snapshot",
  },
  {
    id: "mm",
    path: "/wms/mm",
    label: "Przesunięcia magazynowe",
    icon: ArrowLeftRight,
    sortOrder: 40,
    dashboard: true,
    operationalMode: "mm",
    shortDescription: "Przesunięcia magazynowe",
    accent: A.sky,
    dashboardCategory: "other",
    canPin: true,
    badgeProvider: "consolidations",
  },
  {
    id: "consolidations",
    path: "/wms/consolidations",
    label: "Kompletacja międzymagazynowa",
    icon: PackageCheck,
    sortOrder: 45,
    dashboard: true,
    operationalMode: "consolidations",
    shortDescription: "Kompletacja między magazynami",
    accent: A.violet,
    dashboardCategory: "other",
    canPin: true,
    badgeProvider: "consolidations",
  },
  {
    id: "consolidation_racks",
    path: "/wms/consolidation-racks",
    label: "Podgląd półek",
    icon: LayoutGrid,
    sortOrder: 82,
    dashboard: false,
    operationalMode: "consolidations",
    shortDescription: "Mapa półek",
    accent: A.purple,
    dashboardCategory: "other",
    canPin: false,
  },
  {
    id: "picking",
    path: "/wms/picking",
    label: "Zbieranie",
    icon: ClipboardList,
    sortOrder: 50,
    dashboard: true,
    operationalMode: "picking",
    shortDescription: "Zbieranie zamówień",
    accent: A.blue,
    dashboardCategory: "daily",
    canPin: true,
    badgeProvider: "operations_snapshot",
  },
  {
    id: "production",
    path: "/wms/production/collecting",
    label: "Produkcja — wykonanie",
    icon: Factory,
    sortOrder: 55,
    dashboard: true,
    operationalMode: "production",
    shortDescription: "Wykonanie produkcji",
    accent: A.orange,
    dashboardCategory: "other",
    canPin: true,
  },
  {
    id: "inventory_count",
    path: "/wms/inventory-count",
    label: "Inwentaryzacja",
    icon: ListChecks,
    sortOrder: 56,
    dashboard: true,
    operationalMode: "inventory",
    shortDescription: "Liczenie stanów",
    accent: A.blue,
    dashboardCategory: "control",
    canPin: true,
    badgeProvider: "inventory",
  },
  {
    id: "packing",
    path: "/wms/packing",
    label: "Pakowanie",
    icon: Package,
    sortOrder: 60,
    dashboard: true,
    operationalMode: "packing",
    shortDescription: "Pakowanie zamówień",
    accent: A.violet,
    dashboardCategory: "daily",
    canPin: true,
    badgeProvider: "operations_snapshot",
  },
  {
    id: "issues",
    path: "/wms/braki",
    label: "Braki",
    icon: AlertTriangle,
    sortOrder: 70,
    dashboard: true,
    operationalMode: "issues",
    shortDescription: "Braki i odzyski",
    accent: A.red,
    dashboardCategory: "control",
    canPin: true,
    badgeProvider: "issues",
  },
  {
    id: "product_preview",
    path: "/wms/product-preview",
    label: "Podgląd produktu",
    icon: ScanSearch,
    sortOrder: 80,
    dashboard: true,
    operationalMode: "product_preview",
    shortDescription: "Stan i lokalizacje",
    accent: A.teal,
    dashboardCategory: "control",
    canPin: true,
  },
  {
    id: "operations",
    path: "/wms/operations",
    label: "Operacje",
    icon: Activity,
    sortOrder: 90,
    dashboard: true,
    operationalMode: "operations",
    shortDescription: "Runtime operacji",
    accent: A.sky,
    dashboardCategory: "other",
    canPin: true,
    badgeProvider: "operations_snapshot",
  },
  {
    id: "direct_sales",
    path: "/wms/direct-sales",
    label: "Sprzedaż stacjonarna",
    icon: ShoppingCart,
    sortOrder: 100,
    dashboard: true,
    operationalMode: "direct_sales",
    shortDescription: "Sprzedaż bezpośrednia",
    accent: A.rose,
    dashboardCategory: "other",
    canPin: true,
  },
];

/** Navigation catalog (sorted). */
export const WMS_TAB_ITEMS: WmsTabConfigItem[] = [...WMS_MODULES]
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map(({ id, path, label, icon }) => ({ id, path, label, icon }));

export function getWmsModule(id: WmsTabId): WmsModuleDefinition | undefined {
  return WMS_MODULES.find((m) => m.id === id);
}

export function resolveWmsModuleAccent(moduleId: WmsTabId): WmsModuleAccent {
  return getWmsModule(moduleId)?.accent ?? WMS_MODULE_ACCENT_DEFAULT;
}

/** Active tab detection shared by top bar and quick-access overlay. */
export function isWmsTabPathActive(pathname: string, tab: WmsTabConfigItem): boolean {
  const p = pathname;
  if (tab.id === "issues") {
    return p.startsWith("/wms/braki") || p.startsWith("/wms/issues");
  }
  if (tab.id === "operations") {
    return p.startsWith("/wms/operations");
  }
  if (tab.id === "production") {
    return p === "/wms/production" || p.startsWith("/wms/production/") || p.startsWith("/wms/production");
  }
  if (tab.id === "inventory_count") {
    return p.startsWith("/wms/inventory-count");
  }
  if (tab.id === "consolidations") {
    return p.startsWith("/wms/consolidations");
  }
  if (tab.id === "consolidation_racks") {
    return p.startsWith("/wms/consolidation-racks");
  }
  return p === tab.path || p.startsWith(`${tab.path}/`);
}

/** Resolve module for a WMS pathname (permission gate). */
export function findWmsModuleByPathname(pathname: string): WmsModuleDefinition | undefined {
  const sorted = [...WMS_MODULES].sort((a, b) => b.path.length - a.path.length);
  for (const mod of sorted) {
    if (isWmsTabPathActive(pathname, mod)) return mod;
  }
  return undefined;
}
