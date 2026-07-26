import type { TabItem } from "../../../components/TopTabsNavigation";

import { LIST_BASE } from "./constants";

export const DOCUMENT_TEMPLATES_TABS: TabItem[] = [
  { path: LIST_BASE, label: "Szablony", end: true },
  { path: `${LIST_BASE}/starters`, label: "Gotowe szablony", end: true },
];
