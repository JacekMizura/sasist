import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "@/components/layout/PageLayout";
import { TabsNav } from "@/components/layout/TabsNav";
import { flatSectionDividerClass } from "@/components/layout/flatSectionTokens";
import { ModuleListBreadcrumb } from "@/components/listPage/moduleList";
import { BDO_TABS } from "../../modules/bdo/bdoTabs";
import { resolveBdoTabMeta } from "../../modules/bdo/bdoTabMeta";

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
      {meta ? (
        <>
          <h1 className="text-2xl font-semibold text-slate-900">{meta.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{meta.description}</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-slate-900">BDO</h1>
          <p className="mt-1 text-sm text-slate-500">Ewidencja materiałów opakowaniowych</p>
        </>
      )}
      <TabsNav
        items={BDO_TABS}
        tabLinkSearch={tabLinkSearch || undefined}
        exact
        aria-label="BDO — zakładki"
        className="mt-6 gap-8"
      />
      <div className={`${flatSectionDividerClass} mt-3`} aria-hidden />
      <div className="pt-6">
        <Outlet />
      </div>
    </PageLayout>
  );
}
