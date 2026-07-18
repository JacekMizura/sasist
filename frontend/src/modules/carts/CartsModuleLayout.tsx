import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { flatSectionDividerClass } from "../../components/layout/flatSectionTokens";
import PageLayout from "../../components/layout/PageLayout";
import { TabsNav } from "../../components/layout/TabsNav";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { WmsMessageProvider } from "../../components/wms/WmsMessageProvider";
import { CARTS_TABS } from "./cartsTabs";

/** Pełnoekranowy widok szczegółu / edycji — bez zakładek modułu (wzorzec Materiały magazynowe). */
const FULL_PAGE_CONTENT =
  /^\/carts\/(?:carriers\/[^/]+|racks\/(?:new|[^/]+(?:\/(?:edit|preview))?))$/;

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

/** Białe tło kolumny treści (bez szarego canvasu shella ERP). */
const CARTS_PAGE_SHELL =
  "flex min-h-0 flex-1 flex-col bg-white p-4 md:p-6";

/**
 * Shell modułu Wózki — breadcrumb → taby → treść.
 * `omitCard` + `bg-white`: pełne białe tło jak w innych modułach (bez szarej ramki wokół karty).
 */
export default function CartsModuleLayout() {
  const { pathname } = useLocation();
  const fullPageContent = useMemo(() => FULL_PAGE_CONTENT.test(pathname), [pathname]);
  const activeTab = useMemo(() => resolveActiveCartsTab(pathname), [pathname]);

  if (fullPageContent) {
    return (
      <WmsMessageProvider>
        <PageLayout fullBleed omitCard className={CARTS_PAGE_SHELL}>
          <Outlet />
        </PageLayout>
      </WmsMessageProvider>
    );
  }

  return (
    <WmsMessageProvider>
      <PageLayout fullBleed omitCard className={CARTS_PAGE_SHELL}>
        <ModuleListBreadcrumb
          items={[{ label: "Magazyn", to: "/carts/bulk" }, { label: activeTab.label }]}
        />
        <TabsNav items={CARTS_TABS} exact aria-label="Magazyn — zakładki" className="gap-8" />
        <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
        <div className="pt-4">
          <Outlet />
        </div>
      </PageLayout>
    </WmsMessageProvider>
  );
}
