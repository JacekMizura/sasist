import {
  CreditCard,
  Percent,
  Settings2,
  Tag,
  Warehouse,
} from "lucide-react";

import type { WmsSettingsSectionConfig } from "../../../pages/Settings/wmsSettingsSectionConfig";
import { WMS_SETTINGS_CANONICAL_SECTION } from "../../../pages/Settings/wmsSettingsTokens";

export const DIRECT_SALES_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "ds-general", label: WMS_SETTINGS_CANONICAL_SECTION.general, icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
  { id: "ds-payments", label: "Płatności", icon: CreditCard, iconClassName: "bg-violet-50 text-violet-600" },
  { id: "ds-stock", label: "Stany magazynowe", icon: Warehouse, iconClassName: "bg-emerald-50 text-emerald-600" },
  { id: "ds-pricing", label: "Cennik", icon: Tag, iconClassName: "bg-sky-50 text-sky-600" },
  { id: "ds-discounts", label: "Rabaty", icon: Percent, iconClassName: "bg-amber-50 text-amber-600" },
];
