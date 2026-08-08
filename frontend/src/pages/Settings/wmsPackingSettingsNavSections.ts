import {
  FileText,
  LayoutTemplate,
  ListOrdered,
  Package,
  Printer,
  Settings2,
  Sparkles,
  StickyNote,
  Truck,
  UserRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

const ICONS: Record<string, { icon: LucideIcon; iconClassName: string }> = {
  "wms-pack-view-mode": { icon: LayoutTemplate, iconClassName: "bg-sky-50 text-sky-600" },
  "wms-pack-orders-list-view": { icon: ListOrdered, iconClassName: "bg-cyan-50 text-cyan-700" },
  "wms-pack-mode-settings": { icon: Workflow, iconClassName: "bg-violet-50 text-violet-600" },
  "wms-pack-auto-actions": { icon: Sparkles, iconClassName: "bg-amber-50 text-amber-600" },
  "wms-pack-after-documents": { icon: FileText, iconClassName: "bg-indigo-50 text-indigo-600" },
  "wms-pack-effect-after-auto": { icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
  "wms-pack-sales-document": { icon: FileText, iconClassName: "bg-blue-50 text-blue-600" },
  "wms-pack-shipments": { icon: Truck, iconClassName: "bg-orange-50 text-orange-700" },
  "wms-pack-packer-warehouse": { icon: UserRound, iconClassName: "bg-emerald-50 text-emerald-700" },
  "wms-pack-automation-activators": { icon: Sparkles, iconClassName: "bg-amber-50 text-amber-700" },
  "wms-pack-notes": { icon: StickyNote, iconClassName: "bg-rose-50 text-rose-600" },
  "wms-pack-legacy-templates": { icon: Package, iconClassName: "bg-stone-100 text-stone-600" },
  "wms-pack-orders-list-packed": { icon: ListOrdered, iconClassName: "bg-teal-50 text-teal-700" },
  "wms-pack-parcels": { icon: Package, iconClassName: "bg-lime-50 text-lime-700" },
  "wms-pack-block-extra-parcels": { icon: Package, iconClassName: "bg-red-50 text-red-600" },
  "wms-pack-assistant": { icon: Settings2, iconClassName: "bg-slate-100 text-slate-700" },
  "wms-pack-fallback-label": { icon: Printer, iconClassName: "bg-blue-50 text-blue-700" },
  "wms-pack-new-documents": { icon: FileText, iconClassName: "bg-indigo-50 text-indigo-700" },
};

/** DOM ids — keep in sync with packing panel section cards. */
export const WMS_PACKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-pack-view-mode", label: "Widok trybu pakowania", ...ICONS["wms-pack-view-mode"] },
  { id: "wms-pack-orders-list-view", label: "Lista zamówień (widok)", ...ICONS["wms-pack-orders-list-view"] },
  { id: "wms-pack-mode-settings", label: "Tryb pakowania - ustawienia", ...ICONS["wms-pack-mode-settings"] },
  { id: "wms-pack-auto-actions", label: "Akcje automatyczne", ...ICONS["wms-pack-auto-actions"] },
  { id: "wms-pack-after-documents", label: "Akcje po dokumentach", ...ICONS["wms-pack-after-documents"] },
  { id: "wms-pack-effect-after-auto", label: "Efekt po akcjach", ...ICONS["wms-pack-effect-after-auto"] },
  { id: "wms-pack-sales-document", label: "Dokument sprzedaży", ...ICONS["wms-pack-sales-document"] },
  { id: "wms-pack-shipments", label: "Przesyłki / listy", ...ICONS["wms-pack-shipments"] },
  { id: "wms-pack-packer-warehouse", label: "Osoba pakująca / magazyn", ...ICONS["wms-pack-packer-warehouse"] },
  { id: "wms-pack-automation-activators", label: "Automatyzacja / aktywatory", ...ICONS["wms-pack-automation-activators"] },
  { id: "wms-pack-notes", label: "Notatki", ...ICONS["wms-pack-notes"] },
  { id: "wms-pack-legacy-templates", label: "Szablony zastępcze", ...ICONS["wms-pack-legacy-templates"] },
  { id: "wms-pack-orders-list-packed", label: "Lista zamówień", ...ICONS["wms-pack-orders-list-packed"] },
  { id: "wms-pack-parcels", label: "Paczki", ...ICONS["wms-pack-parcels"] },
  { id: "wms-pack-block-extra-parcels", label: "Blokowanie paczek", ...ICONS["wms-pack-block-extra-parcels"] },
  { id: "wms-pack-assistant", label: "Asystent pakowania", ...ICONS["wms-pack-assistant"] },
  { id: "wms-pack-fallback-label", label: "Etykieta zastępcza", ...ICONS["wms-pack-fallback-label"] },
  { id: "wms-pack-new-documents", label: "Dokumenty sprzedaży (nowe)", ...ICONS["wms-pack-new-documents"] },
];

/** @deprecated Use {@link WmsSettingsSectionConfig} */
export type WmsSettingsNavSection = WmsSettingsSectionConfig;
