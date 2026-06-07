/**
 * Canonical WMS module registry — dashboard tiles, top navigation, pinned modes.
 * Every module (including Produkcja) uses the same definition shape.
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ClipboardList,
  Factory,
  Inbox,
  Package,
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
  | "picking"
  | "product_preview"
  | "packing"
  | "issues"
  | "direct_sales"
  | "operations"
  | "production";

/** Backend ``wms_operational_modes`` key; omit = always visible (no mode gate). */
export type WmsOperationalModeKey = string;

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
};

export type WmsTabConfigItem = Pick<WmsModuleDefinition, "id" | "path" | "label" | "icon">;

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
  },
  {
    id: "receiving",
    path: "/wms/receiving",
    label: "Przyjęcie",
    icon: Inbox,
    sortOrder: 20,
    dashboard: true,
    operationalMode: "receiving",
    shortDescription: "Przyjęcia PZ i dostaw",
  },
  {
    id: "putaway",
    path: "/wms/putaway",
    label: "Rozlokowanie PZ",
    icon: Warehouse,
    sortOrder: 30,
    dashboard: true,
    shortDescription: "Rozlokowanie po przyjęciu",
  },
  {
    id: "mm",
    path: "/wms/mm",
    label: "Przesunięcia magazynowe",
    icon: ArrowLeftRight,
    sortOrder: 40,
    dashboard: true,
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
  },
  {
    id: "production",
    path: "/wms/production/collecting",
    label: "Produkcja — wykonanie",
    icon: Factory,
    sortOrder: 55,
    dashboard: true,
    shortDescription: "Zbieranie surowców, wykonanie i odkładanie wyrobów",
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
  },
  {
    id: "issues",
    path: "/wms/braki",
    label: "Braki",
    icon: AlertTriangle,
    sortOrder: 70,
    dashboard: true,
  },
  {
    id: "product_preview",
    path: "/wms/product-preview",
    label: "Podgląd produktu",
    icon: ScanSearch,
    sortOrder: 80,
    dashboard: true,
  },
  {
    id: "operations",
    path: "/wms/operations",
    label: "Operacje",
    icon: Activity,
    sortOrder: 90,
    dashboard: true,
    shortDescription: "Runtime operacji magazynowych",
  },
  {
    id: "direct_sales",
    path: "/wms/direct-sales",
    label: "Sprzedaż stacjonarna",
    icon: ShoppingCart,
    sortOrder: 100,
    dashboard: true,
  },
];

/** Navigation catalog (sorted). */
export const WMS_TAB_ITEMS: WmsTabConfigItem[] = [...WMS_MODULES]
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map(({ id, path, label, icon }) => ({ id, path, label, icon }));

export function getWmsModule(id: WmsTabId): WmsModuleDefinition | undefined {
  return WMS_MODULES.find((m) => m.id === id);
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
  return p === tab.path || p.startsWith(`${tab.path}/`);
}
