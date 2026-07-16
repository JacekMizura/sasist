import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "@/components/layout/PageLayout";
import { TabsNav } from "@/components/layout/TabsNav";
import { flatSectionDividerClass } from "@/components/layout/flatSectionTokens";
import { ModuleListBreadcrumb } from "@/components/listPage/moduleList";
import { BDO_TABS } from "../../modules/bdo/bdoTabs";
import { resolveBdoTabMeta } from "../../modules/bdo/bdoTabMeta";

/** Shell BDO — breadcrumb → zakładki → treść (bez pośredniego h1 / opisu). */
export default function BdoLayout() {
  const location = useLocation();
  const tabLinkSearch = useMemo(() => {
    const tid = new URLSearchParams(location.search).get("tenant_id");
    return tid != null && tid !== "" ? `?tenant_id=${encodeURIComponent(tid)}` : "";
  }, [location.search]);

  const meta = resolveBdoTabMeta(location.pathname);

  return (
    <PageLayout fullBleed>
      <ModuleListBreadcrumb
        items={[
          { label: "Asortyment", to: "/products/list" },
          { label: "BDO", to: "/warehouse/bdo/dashboard" },
          ...(meta ? [{ label: meta.breadcrumbLabel }] : []),
        ]}
      />
      <TabsNav
        items={BDO_TABS}
        tabLinkSearch={tabLinkSearch || undefined}
        exact
        aria-label="BDO — zakładki"
        className="gap-8"
      />
      <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
      <div className="pt-4">
        <Outlet />
      </div>
    </PageLayout>
  );
}
