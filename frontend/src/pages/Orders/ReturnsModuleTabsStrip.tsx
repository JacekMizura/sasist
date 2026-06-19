import { useLocation } from "react-router-dom";

import { TabsContainer } from "../../components/layout/TabsContainer";
import { TabsNav } from "../../components/layout/TabsNav";

const BASE = "/orders/returns";

/** Zakładki modułu Zwroty — te same trasy co wcześniej w {@link ReturnsModuleLayout}. */
export const RETURNS_MODULE_TABS = [
  { path: BASE, label: "Zwroty zamówień", end: true as const },
  {
    path: `${BASE}/statuses`,
    label: "Statusy",
    end: true as const,
    activePaths: [`${BASE}/panel-statuses`, `${BASE}/workflow-statuses`],
  },
  { path: `${BASE}/dictionaries`, label: "Słowniki zwrotów", end: true as const, activePaths: [`${BASE}/return-types`, `${BASE}/sources`] },
  { path: `${BASE}/configurator`, label: "Konfigurator", end: true as const },
];

/** Ukrywane na szczegółach RMZ (`/orders/returns/:id`) — shell modułu pomija breadcrumb i zakładki. */
export function isReturnsModuleDetailPath(pathname: string): boolean {
  return /^\/orders\/returns\/\d+(\/|$)/.test(pathname);
}

/** Pasuje do listy zamówień: zakładki w treści strony, bez dodatkowej „aplikacji w aplikacji”. */
export default function ReturnsModuleTabsStrip() {
  const { pathname } = useLocation();
  if (isReturnsModuleDetailPath(pathname)) return null;

  return (
    <TabsContainer className="mb-3 w-full [-webkit-overflow-scrolling:touch] pb-0 pt-0">
      <TabsNav items={RETURNS_MODULE_TABS} aria-label="Zwroty — zakładki" />
    </TabsContainer>
  );
}
