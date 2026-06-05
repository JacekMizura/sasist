/**
 * Top tabs inside WMS (single row, no submenus).
 * Paths are relative to /wms.
 *
 * Nośniki (warehouse carriers) nie mają osobnej zakładki WMS — są warstwą logistyczną
 * w przyjęciu PZ, rozlokowaniu, MM i zbieraniu; tworzenie serii tylko z ekranu przyjęcia.
 */

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardList,
  Inbox,
  Package,
  ScanSearch,
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
  | "issues";

export type WmsTabConfigItem = {
  id: WmsTabId;
  path: string;
  label: string;
  icon: LucideIcon;
};

export const WMS_TAB_ITEMS: WmsTabConfigItem[] = [
  { id: "returns", path: "/wms/returns", label: "Zwroty / Reklamacje", icon: Undo2 },
  { id: "receiving", path: "/wms/receiving", label: "Przyjęcie", icon: Inbox },
  { id: "putaway", path: "/wms/putaway", label: "Rozlokowanie", icon: Warehouse },
  { id: "mm", path: "/wms/mm", label: "Przesunięcia magazynowe", icon: ArrowLeftRight },
  { id: "picking", path: "/wms/picking", label: "Zbieranie", icon: ClipboardList },
  { id: "issues", path: "/wms/braki", label: "Braki", icon: AlertTriangle },
  { id: "product_preview", path: "/wms/product-preview", label: "Podgląd produktu", icon: ScanSearch },
  { id: "packing", path: "/wms/packing", label: "Pakowanie", icon: Package },
];

/** Active tab detection shared by top bar and quick-access overlay. */
export function isWmsTabPathActive(pathname: string, tab: WmsTabConfigItem): boolean {
  const p = pathname;
  if (tab.id === "issues") {
    return p.startsWith("/wms/braki") || p.startsWith("/wms/issues");
  }
  return p === tab.path || p.startsWith(`${tab.path}/`);
}
