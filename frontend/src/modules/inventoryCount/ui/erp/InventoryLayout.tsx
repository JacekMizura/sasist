import { Link, Outlet, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";

import PageLayout from "@/components/layout/PageLayout";
import { TabsNav } from "@/components/layout/TabsNav";
import { flatSectionDividerClass } from "@/components/layout/flatSectionTokens";
import { ModuleListBreadcrumb } from "@/components/listPage/moduleList";
import { filterToolbarBtnApply } from "@/components/filters/filterUiTokens";
import { ERP_INVENTORY_COUNT_TABS } from "../../erpInventoryCountTabs";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";

/** ERP inventory — shell modułu (breadcrumb → tytuł + CTA → zakładki → treść). */
export default function InventoryLayout() {
  const { pathname } = useLocation();
  const onWizard = pathname.startsWith(erpInventoryCountPaths.wizard);

  return (
    <PageLayout fullBleed>
      <ModuleListBreadcrumb items={[{ label: "Magazyn" }, { label: "Inwentaryzacja" }]} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Inwentaryzacja magazynowa</h1>
        {!onWizard ? (
          <Link to={erpInventoryCountPaths.wizard} className={filterToolbarBtnApply}>
            <Plus className="mr-1.5 inline h-4 w-4" strokeWidth={2} aria-hidden />
            Nowa inwentaryzacja
          </Link>
        ) : null}
      </div>
      <TabsNav
        items={ERP_INVENTORY_COUNT_TABS}
        exact
        aria-label="Inwentaryzacja magazynowa — zakładki"
        className="mt-6 gap-8"
      />
      <div className={`${flatSectionDividerClass} mt-3`} aria-hidden />
      <div className="pt-6">
        <Outlet />
      </div>
    </PageLayout>
  );
}
