import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "@/components/layout/PageLayout";
import { TabsNav } from "@/components/layout/TabsNav";
import { flatSectionDividerClass } from "@/components/layout/flatSectionTokens";
import { ModuleListBreadcrumb } from "@/components/listPage/moduleList";
import { ERP_PRODUCTION_TABS } from "../../modules/production/erpProductionTabs";

/** Szczegóły partii / receptury — bez zakładek modułu. */
const FULL_PAGE_DETAIL = /^\/production\/(?:batch\/[^/]+|recipes\/[^/]+)$/;

/** ERP production management shell — standard module layout. */
export default function ProductionErpModuleLayout() {
  const { pathname } = useLocation();
  const fullPageDetail = useMemo(() => FULL_PAGE_DETAIL.test(pathname), [pathname]);

  if (fullPageDetail) {
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
          { label: "Produkcja" },
          { label: "Zarządzanie produkcją" },
        ]}
      />
      <h1 className="text-2xl font-semibold text-slate-900">Zarządzanie produkcją</h1>
      <p className="mt-1 text-sm text-slate-500">
        Zlecenia i planowanie produkcji — receptury jako dane pomocnicze. Wykonanie w terminalu WMS.
      </p>
      <TabsNav
        items={ERP_PRODUCTION_TABS}
        exact
        aria-label="Zarządzanie produkcją — zakładki"
        className="mt-4 gap-6"
      />
      <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
      <div className="pt-4">
        <Outlet />
      </div>
    </PageLayout>
  );
}
