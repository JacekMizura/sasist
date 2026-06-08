import { Outlet } from "react-router-dom";

import { PageContainer } from "../../components/layout/PageLayout";
import TopTabsNavigation from "../../components/TopTabsNavigation";
import { ERP_INVENTORY_COUNT_TABS } from "../../modules/inventoryCount/erpInventoryCountTabs";

/** ERP inventory management shell — planning, documents, approvals. */
export default function InventoryCountErpLayout() {
  return (
    <PageContainer className="min-h-[600px]">
      <div className="border-b border-slate-200 bg-white -mx-4 px-4 lg:-mx-6 lg:px-6">
        <div className="py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600">Magazyn · Inwentaryzacja ERP</p>
          <h1 className="text-lg font-semibold text-slate-900">Inwentaryzacja magazynowa</h1>
          <p className="text-xs text-slate-500">Analiza, zatwierdzanie i raporty — liczenie w terminalu WMS</p>
        </div>
        <TopTabsNavigation tabs={[...ERP_INVENTORY_COUNT_TABS]} exact aria-label="Moduł inwentaryzacji ERP" />
      </div>
      <div className="pt-3">
        <Outlet />
      </div>
    </PageContainer>
  );
}
