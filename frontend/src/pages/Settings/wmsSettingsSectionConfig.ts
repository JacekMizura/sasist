import type { LucideIcon } from "lucide-react";

/** Declarative subsection ids for WMS settings — must match scroll targets (`id` on section roots). */
export type WmsSettingsSectionConfig = {
  id: string;
  label: string;
  /** Optional left-nav icon (Lucide). */
  icon?: LucideIcon;
  /** Tailwind bg/text pair for icon chip, e.g. "bg-orange-50 text-orange-600". */
  iconClassName?: string;
  /** Extra keywords for in-tab settings search. */
  searchText?: string;
};
