import { Link, Outlet, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";

import PageLayout from "@/components/layout/PageLayout";
import { TabsNav } from "@/components/layout/TabsNav";
import { flatSectionDividerClass } from "@/components/layout/flatSectionTokens";
import { ModuleListBreadcrumb } from "@/components/listPage/moduleList";
import { filterToolbarBtnApply } from "@/components/filters/filterUiTokens";
import { ERP_INVENTORY_COUNT_TABS } from "../../erpInventoryCountTabs";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";

/** ERP inventory — breadcrumb → zakładki (+ CTA) → treść (bez pośredniego h1). */
export default function InventoryLayout() {
  const { pathname } = useLocation();
  const onWizard = pathname.startsWith(erpInventoryCountPaths.wizard);

  return (
    <PageLayout fullBleed>
      <ModuleListBreadcrumb items={[{ label: "Magazyn" }, { label: "Inwentaryzacja" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TabsNav
          items={ERP_INVENTORY_COUNT_TABS}
          exact
          aria-label="Inwentaryzacja magazynowa — zakładki"
          className="min-w-0 flex-1 gap-8"
        />
        {!onWizard ? (
          <Link to={erpInventoryCountPaths.wizard} className={`${filterToolbarBtnApply} shrink-0`}>
            <Plus className="mr-1.5 inline h-4 w-4" strokeWidth={2} aria-hidden />
            Nowa inwentaryzacja
          </Link>
        ) : null}
      </div>
      <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
      <div className="pt-4">
        <Outlet />
      </div>
    </PageLayout>
  );
}
