import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { flatSectionDividerClass } from "../../components/layout/flatSectionTokens";
import PageLayout from "../../components/layout/PageLayout";
import { TabsNav } from "../../components/layout/TabsNav";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { SUPPLIER_MODULE_TABS } from "../../modules/suppliers/supplierModuleTabs";

/**
 * Shell modułu Dostawcy — breadcrumb → zakładki → treść (bez pośredniego h1).
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
      <TabsNav
        items={SUPPLIER_MODULE_TABS}
        tabLinkSearch={tabLinkSearch || undefined}
        exact
        aria-label="Dostawcy — zakładki"
        className="gap-8"
      />
      <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
      <div className="pt-4">
        <Outlet />
      </div>
    </PageLayout>
  );
}
