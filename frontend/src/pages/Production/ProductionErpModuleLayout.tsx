import { Outlet } from "react-router-dom";

import { PageContainer } from "../../components/layout/PageLayout";
import TopTabsNavigation from "../../components/TopTabsNavigation";
import { ERP_PRODUCTION_TABS } from "../../modules/production/erpProductionTabs";

/**
 * ERP production management shell — business planning UI, not WMS terminal styling.
 */
export default function ProductionErpModuleLayout() {
  return (
    <PageContainer className="min-h-[600px]">
      <div className="border-b border-slate-200 bg-white -mx-4 px-4 lg:-mx-6 lg:px-6">
        <div className="py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Asortyment · Produkcja</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Zarządzanie produkcją</h1>
          <p className="mt-1 text-sm text-slate-500">Zlecenia i planowanie produkcji — receptury jako dane pomocnicze. Wykonanie w terminalu WMS.</p>
        </div>
        <TopTabsNavigation tabs={ERP_PRODUCTION_TABS} exact={false} aria-label="Moduł produkcji ERP" />
      </div>
      <div className="pt-4">
        <Outlet />
      </div>
    </PageContainer>
  );
}
