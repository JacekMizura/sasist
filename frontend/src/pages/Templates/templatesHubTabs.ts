import type { TabItem } from "../../components/TopTabsNavigation";
import {
  TEMPLATES_EXPORTS_BASE,
  TEMPLATES_LABELS_BASE,
  TEMPLATES_MESSAGES_BASE,
  TEMPLATES_PRINT_BASE,
} from "./templatesPaths";

/** Hub sections — not exact so nested routes keep the parent section active. */
export const TEMPLATES_HUB_TABS: TabItem[] = [
  { path: TEMPLATES_LABELS_BASE, label: "Szablony etykiet" },
  { path: TEMPLATES_PRINT_BASE, label: "Szablony wydruków" },
  { path: TEMPLATES_MESSAGES_BASE, label: "Szablony wiadomości" },
  { path: TEMPLATES_EXPORTS_BASE, label: "Eksporty" },
];
