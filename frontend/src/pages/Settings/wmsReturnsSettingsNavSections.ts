import { Factory, Printer, Settings2 } from "lucide-react";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

export const WMS_RETURNS_MODE_SECTION_ID = "wms-returns-workflow-mode";
export const WMS_RETURNS_ZPZ_SECTION_ID = "wms-returns-z-pz-label";
export const WMS_RETURNS_MFG_SECTION_ID = "wms-returns-manufactured";

/** Left-nav sections for Ustawienia → WMS → Zwroty (DTE print templates live in ERP only). */
export const WMS_RETURNS_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  {
    id: WMS_RETURNS_MODE_SECTION_ID,
    label: "Ogólne",
    icon: Settings2,
    iconClassName: "bg-slate-100 text-slate-600",
  },
  {
    id: WMS_RETURNS_ZPZ_SECTION_ID,
    label: "Przyjęcie",
    icon: Printer,
    iconClassName: "bg-sky-50 text-sky-600",
    searchText: "etykieta Z-PZ",
  },
  {
    id: WMS_RETURNS_MFG_SECTION_ID,
    label: "Produkty produkowane",
    icon: Factory,
    iconClassName: "bg-emerald-50 text-emerald-700",
    searchText: "odzysk komponentów BOM",
  },
];
