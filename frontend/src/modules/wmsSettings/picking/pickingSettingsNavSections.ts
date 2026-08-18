import {
  LayoutTemplate,
  ListOrdered,
  ScanLine,
  Settings2,
  Sparkles,
  Tablet,
  TriangleAlert,
  Warehouse,
} from "lucide-react";

import type { WmsSettingsSectionConfig } from "../../../pages/Settings/wmsSettingsSectionConfig";

/**
 * Left-nav sections for picking settings (DOM ids stable for scrollspy).
 * Labels aligned with Pakowanie-style IA; field names / APIs unchanged.
 */
export const WMS_PICKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  {
    id: "wms-pick-modes",
    label: "Konfigurator zbierania",
    icon: Settings2,
    iconClassName: "bg-slate-100 text-slate-600",
    searchText: "konfigurator zbierania statusy tryby",
  },
  {
    id: "wms-pick-view",
    label: "Widok",
    icon: LayoutTemplate,
    iconClassName: "bg-sky-50 text-sky-600",
    searchText: "interfejs kolumny lista",
  },
  {
    id: "wms-pick-queue",
    label: "Lista zleceń",
    icon: ListOrdered,
    iconClassName: "bg-violet-50 text-violet-600",
    searchText: "akcja po zebraniu zbiór wybór typu kurierzy",
  },
  {
    id: "wms-pick-scan",
    label: "Walidacja zbierania",
    icon: ScanLine,
    iconClassName: "bg-cyan-50 text-cyan-700",
    searchText: "skan walidacja ean lokalizacja przydział",
  },
  {
    id: "wms-pick-shortage",
    label: "Braki",
    icon: TriangleAlert,
    iconClassName: "bg-rose-50 text-rose-600",
    searchText: "braki status wózek",
  },
  {
    id: "wms-pick-warehouses",
    label: "Magazyny",
    icon: Warehouse,
    iconClassName: "bg-emerald-50 text-emerald-600",
  },
  {
    id: "wms-pick-automation",
    label: "Automatyzacja",
    icon: Sparkles,
    iconClassName: "bg-orange-50 text-orange-600",
  },
  {
    id: "wms-pick-advanced",
    label: "Zaawansowane",
    icon: Tablet,
    iconClassName: "bg-indigo-50 text-indigo-600",
  },
];
