import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";
import { SettingsModuleStack } from "../../components/layout/SettingsModuleStack";
import { WmsMessageProvider } from "../../components/wms/WmsMessageProvider";
import { CARTS_TABS } from "./cartsTabs";
import { CartsTabActionsProvider, useCartsTabActionsSlot } from "./CartsTabActionsContext";

/** Pełnoekranowy widok szczegółu nośnika — bez zakładek modułu. Regały zachowują tabs. */
const FULL_PAGE_CONTENT = /^\/carts\/carriers\/[^/]+$/;

/** Aktywna zakładka z pathname — breadcrumb odzwierciedla bieżący widok. */
function resolveActiveCartsTab(pathname: string) {
  for (const tab of CARTS_TABS) {
    if (tab.end === false && (pathname === tab.path || pathname.startsWith(`${tab.path}/`))) {
      return tab;
    }
  }
  for (const tab of CARTS_TABS) {
    if (pathname === tab.path) return tab;
  }
  const byLongest = [...CARTS_TABS].sort((a, b) => b.path.length - a.path.length);
  for (const tab of byLongest) {
    if (pathname === tab.path || pathname.startsWith(`${tab.path}/`)) return tab;
  }
  return CARTS_TABS[0];
}

function CartsModuleChrome() {
  const { pathname } = useLocation();
  const fullPageContent = useMemo(() => FULL_PAGE_CONTENT.test(pathname), [pathname]);
  const activeTab = useMemo(() => resolveActiveCartsTab(pathname), [pathname]);
  const tabActions = useCartsTabActionsSlot();

  if (fullPageContent) {
    return (
      <PageLayout fullBleed fillHeight cardClassName="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </PageLayout>
    );
  }

  return (
    <PageLayout fullBleed fillHeight cardClassName="flex min-h-0 flex-1 flex-col">
      <SettingsModuleStack
        breadcrumbs={[{ label: "Magazyn", to: "/carts/bulk" }, { label: activeTab.label }]}
        hideTitle
        tabs={CARTS_TABS}
        tabsExact
        tabsChrome="bare"
        tabsTrailing={tabActions}
        tabsAriaLabel="Magazyn — zakładki"
      >
        <Outlet />
      </SettingsModuleStack>
    </PageLayout>
  );
}

/**
 * Shell modułu Magazyn — Layout 2.0: jeden PageContainer (breadcrumb → tabs → treść).
 */
export default function CartsModuleLayout() {
  return (
    <WmsMessageProvider>
      <CartsTabActionsProvider>
        <CartsModuleChrome />
      </CartsTabActionsProvider>
    </WmsMessageProvider>
  );
}
