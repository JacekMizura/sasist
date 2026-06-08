import { Outlet } from "react-router-dom";

import { PageContainer } from "../../components/layout/PageLayout";
import { PageModuleHeader } from "../../components/layout/PageModuleHeader";
import TopTabsNavigation from "../../components/TopTabsNavigation";
import { ERP_INVENTORY_COUNT_TABS } from "../../modules/inventoryCount/erpInventoryCountTabs";

/** ERP inwentaryzacja — ten sam shell co pozostałe moduły magazynowe. */
export default function InventoryCountErpLayout() {
  return (
    <PageContainer>
      <div className="border-b border-slate-200 bg-white -mx-4 px-4 lg:-mx-6 lg:px-6">
        <div className="py-2">
          <PageModuleHeader
            title="Inwentaryzacja magazynowa"
            subtitle="Planowanie, zatwierdzanie i raporty — liczenie w terminalu WMS."
          />
        </div>
        <TopTabsNavigation tabs={[...ERP_INVENTORY_COUNT_TABS]} exact aria-label="Inwentaryzacja" />
      </div>
      <div className="pt-3">
        <Outlet />
      </div>
    </PageContainer>
  );
}
