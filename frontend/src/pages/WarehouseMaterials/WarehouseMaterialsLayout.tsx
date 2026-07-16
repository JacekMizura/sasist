import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { flatSectionDividerClass } from "../../components/layout/flatSectionTokens";
import PageLayout from "../../components/layout/PageLayout";
import { TabsNav } from "../../components/layout/TabsNav";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { UI_STRINGS } from "../../constants/uiStrings";
import { WAREHOUSE_MATERIALS_MODULE_TABS } from "../../modules/warehouseMaterials/warehouseMaterialsModuleTabs";

/** Pełnoekranowy formularz edycji / dodawania — bez zakładek modułu (wzorzec Produkty / Dostawcy). */
const FULL_PAGE_FORM = /^\/warehouse-materials\/(?:cartons|packaging)\/(?:new|[^/]+)$/;

/**
 * Shell modułu Materiały magazynowe — breadcrumb → zakładki → treść (bez pośredniego h1).
 */
export default function WarehouseMaterialsLayout() {
  const { pathname } = useLocation();
  const fullPageForm = useMemo(() => FULL_PAGE_FORM.test(pathname), [pathname]);

  if (fullPageForm) {
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
          { label: "Asortyment", to: "/products/list" },
          { label: UI_STRINGS.navigation.warehouseMaterials },
        ]}
      />
      <TabsNav
        items={WAREHOUSE_MATERIALS_MODULE_TABS}
        exact
        aria-label="Materiały magazynowe — zakładki"
        className="gap-8"
      />
      <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
      <div className="pt-4">
        <Outlet />
      </div>
    </PageLayout>
  );
}
