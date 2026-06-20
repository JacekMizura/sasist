import type { LucideIcon } from "lucide-react";
import { Coins, LayoutList, Leaf, Package, Settings2, Tag, Truck, Warehouse } from "lucide-react";

export type CartonEditTabId = "basic" | "supplier" | "warehouse" | "costs" | "pricing" | "bdo" | "shipping";

export type PackagingEditTabId = "basic" | "technical" | "pricing" | "supplier" | "warehouse" | "bdo";

export const CARTON_EDIT_TABS: { id: CartonEditTabId; label: string; icon: LucideIcon }[] = [
  { id: "basic", label: "Dane podstawowe", icon: LayoutList },
  { id: "supplier", label: "Dostawca", icon: Truck },
  { id: "warehouse", label: "Magazyn", icon: Warehouse },
  { id: "costs", label: "Koszty", icon: Coins },
  { id: "pricing", label: "Cennik progowy", icon: Tag },
  { id: "bdo", label: "BDO", icon: Leaf },
  { id: "shipping", label: "Metody dostawy", icon: Package },
];

export const PACKAGING_EDIT_TABS: { id: PackagingEditTabId; label: string; icon: LucideIcon }[] = [
  { id: "basic", label: "Dane podstawowe", icon: LayoutList },
  { id: "technical", label: "Parametry techniczne", icon: Settings2 },
  { id: "pricing", label: "Cennik", icon: Tag },
  { id: "supplier", label: "Dostawca", icon: Truck },
  { id: "warehouse", label: "Magazyn", icon: Warehouse },
  { id: "bdo", label: "BDO", icon: Leaf },
];
