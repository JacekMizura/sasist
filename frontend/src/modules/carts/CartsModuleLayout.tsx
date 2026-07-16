import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { flatSectionDividerClass } from "../../components/layout/flatSectionTokens";
import PageLayout from "../../components/layout/PageLayout";
import { TabsNav } from "../../components/layout/TabsNav";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { UI_STRINGS } from "../../constants/uiStrings";
import { CARTS_TABS } from "./cartsTabs";

/** Pełnoekranowy widok szczegółu / edycji — bez zakładek modułu (wzorzec Materiały magazynowe). */
const FULL_PAGE_CONTENT =
  /^\/carts\/(?:carriers\/[^/]+|racks\/(?:new|[^/]+(?:\/(?:edit|preview))?))$/;

/**
 * Shell modułu Wózki — jeden breadcrumb + tytuł + zakładki.
 * Zakładki wewnętrzne nie renderują własnego PageHeader / breadcrumb.
 */
export default function CartsModuleLayout() {
  const { pathname } = useLocation();
  const fullPageContent = useMemo(() => FULL_PAGE_CONTENT.test(pathname), [pathname]);

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
        items={[
          { label: "Magazyn", to: "/carts/bulk" },
          { label: UI_STRINGS.navigation.carts },
        ]}
      />
      <h1 className="text-2xl font-semibold text-slate-900">{UI_STRINGS.navigation.carts}</h1>
      <TabsNav items={CARTS_TABS} exact aria-label="Wózki — zakładki" className="mt-4 gap-8" />
      <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
      <div className="pt-4">
        <Outlet />
      </div>
    </PageLayout>
  );
}
