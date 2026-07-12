import type { TabItem } from "../../../components/TopTabsNavigation";

export const PRINTING_SETTINGS_BASE = "/settings/printers";

export const PRINTING_SETTINGS_TABS: TabItem[] = [
  { path: `${PRINTING_SETTINGS_BASE}/agents`, label: "Agenci" },
  { path: `${PRINTING_SETTINGS_BASE}/devices`, label: "Drukarki" },
  { path: `${PRINTING_SETTINGS_BASE}/queue`, label: "Kolejka" },
  { path: `${PRINTING_SETTINGS_BASE}/defaults`, label: "Domyślne" },
  { path: `${PRINTING_SETTINGS_BASE}/auto-print`, label: "Auto-druk" },
  { path: `${PRINTING_SETTINGS_BASE}/legacy`, label: "QZ (legacy)" },
];
