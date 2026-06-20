import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";
import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { WAREHOUSE_MATERIALS_MODULE_TABS } from "../../modules/warehouseMaterials/warehouseMaterialsModuleTabs";

/** Pełnoekranowy formularz edycji / dodawania — bez zakładek modułu (wzorzec Produkty). */
const FULL_PAGE_FORM = /^\/warehouse-materials\/(?:cartons|packaging)\/(?:new|[^/]+)$/;

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

  return <WmsModuleLayout tabs={WAREHOUSE_MATERIALS_MODULE_TABS} exact={false} flushHorizontal />;
}
