import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { flatSectionDividerClass } from "../../components/layout/flatSectionTokens";
import PageLayout from "../../components/layout/PageLayout";
import { TabsNav } from "../../components/layout/TabsNav";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { CARTS_TABS } from "./cartsTabs";

/** Pełnoekranowy widok szczegółu / edycji — bez zakładek modułu (wzorzec Materiały magazynowe). */
const FULL_PAGE_CONTENT =
  /^\/carts\/(?:carriers\/[^/]+|racks\/(?:new|[^/]+(?:\/(?:edit|preview))?))$/;

/** Aktywna zakładka z pathname — breadcrumb i tytuł odzwierciedlają bieżący widok. */
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

/**
 * Shell modułu Wózki — breadcrumb + tytuł zależne od aktywnej zakładki, potem taby.
 * Zakładki wewnętrzne nie renderują własnego PageHeader / breadcrumb.
 */
export default function CartsModuleLayout() {
  const { pathname } = useLocation();
  const fullPageContent = useMemo(() => FULL_PAGE_CONTENT.test(pathname), [pathname]);
  const activeTab = useMemo(() => resolveActiveCartsTab(pathname), [pathname]);

  if (fullPageContent) {
    return (
      <PageLayout fullBleed>
        <Outlet />
      </PageLayout>
    );
  }

  return (
    <PageLayout fullBleed>
      <ModuleListBreadcrumb
        items={[{ label: "Magazyn", to: "/carts/bulk" }, { label: activeTab.label }]}
      />
      <h1 className="text-2xl font-semibold text-slate-900">{activeTab.label}</h1>
      <TabsNav items={CARTS_TABS} exact aria-label="Magazyn — zakładki" className="mt-4 gap-8" />
      <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
      <div className="pt-4">
        <Outlet />
      </div>
    </PageLayout>
  );
}
