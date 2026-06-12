import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";

import PageLayout from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { listSellasistIconBtn } from "@/components/listPage/listSellasistTokens";
import { ERP_INVENTORY_COUNT_TABS } from "../../erpInventoryCountTabs";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { erpTabIndicator, erpTabLink } from "./theme";

/** ERP inventory — WMS-aligned module shell. */
export default function InventoryLayout() {
  const { pathname } = useLocation();
  const onWizard = pathname.startsWith(erpInventoryCountPaths.wizard);

  const primaryAction = !onWizard ? (
    <NavLink
      to={erpInventoryCountPaths.wizard}
      className={listSellasistIconBtn}
      title="Nowa inwentaryzacja"
      aria-label="Nowa inwentaryzacja"
    >
      <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
    </NavLink>
  ) : null;

  return (
    <PageLayout fullBleed cardClassName="relative min-h-0 w-full">
      <div className="min-w-0">
        <PageHeader
          title="Inwentaryzacja magazynowa"
          actions={primaryAction}
          breadcrumbs={[
            { label: "Magazyn" },
            { label: "Inwentaryzacja" },
          ]}
          className="space-y-2"
        />

        <nav
          className="mt-2 flex gap-5 border-b border-slate-200/90 text-sm"
          aria-label="Inwentaryzacja magazynowa"
        >
          {ERP_INVENTORY_COUNT_TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end ?? false}
              className={({ isActive }) => erpTabLink(isActive)}
            >
              {({ isActive }) => (
                <>
                  {tab.label}
                  {isActive ? <span className={erpTabIndicator} aria-hidden /> : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0 pt-4">
          <Outlet />
        </div>
      </div>
    </PageLayout>
  );
}
