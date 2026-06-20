import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { flatSectionDividerClass } from "../../components/layout/flatSectionTokens";
import PageLayout from "../../components/layout/PageLayout";
import { TabsNav } from "../../components/layout/TabsNav";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { SUPPLIER_MODULE_TABS } from "../../modules/suppliers/supplierModuleTabs";

/**
 * Shell modułu Dostawcy — breadcrumb → tytuł → zakładki → treść (wzorzec Zwroty / akcje automatyczne).
 * Bez dodatkowej karty wokół tabów; jeden {@link PageLayout} na cały moduł.
 */
export default function SuppliersLayout() {
  const location = useLocation();
  const tabLinkSearch = useMemo(() => {
    const tid = new URLSearchParams(location.search).get("tenant_id");
    return tid != null && tid !== "" ? `?tenant_id=${encodeURIComponent(tid)}` : "";
  }, [location.search]);

  return (
    <PageLayout fullBleed>
      <ModuleListBreadcrumb
        items={[
          { label: "Asortyment", to: "/products/list" },
          { label: "Dostawcy" },
        ]}
      />
      <h1 className="text-2xl font-semibold text-slate-900">Dostawcy</h1>
      <TabsNav
        items={SUPPLIER_MODULE_TABS}
        tabLinkSearch={tabLinkSearch || undefined}
        exact
        aria-label="Dostawcy — zakładki"
        className="mt-6 gap-8"
      />
      <div className={`${flatSectionDividerClass} mt-3`} aria-hidden />
      <div className="pt-6">
        <Outlet />
      </div>
    </PageLayout>
  );
}
