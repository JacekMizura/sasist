import { Outlet } from "react-router-dom";

import { PageContainer } from "../../components/layout/PageLayout";
import TopTabsNavigation from "../../components/TopTabsNavigation";
import { ERP_INVENTORY_COUNT_TABS } from "../../modules/inventoryCount/erpInventoryCountTabs";

/** ERP inventory management shell — planning, documents, approvals. */
export default function InventoryCountErpLayout() {
  return (
    <PageContainer className="min-h-[600px]">
      <div className="border-b border-slate-200 bg-white -mx-4 px-4 lg:-mx-6 lg:px-6">
        <div className="py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Magazyn · Inwentaryzacja</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Inwentaryzacja magazynowa</h1>
          <p className="mt-1 text-sm text-slate-500">
            Planowanie, dokumenty i zatwierdzanie. Liczenie w terminalu WMS — bez podglądu stanów w trybie blind.
          </p>
        </div>
        <TopTabsNavigation tabs={[...ERP_INVENTORY_COUNT_TABS]} exact={false} aria-label="Moduł inwentaryzacji ERP" />
      </div>
      <div className="pt-4">
        <Outlet />
      </div>
    </PageContainer>
  );
}
