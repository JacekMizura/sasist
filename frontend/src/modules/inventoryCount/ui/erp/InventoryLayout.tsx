import { NavLink, Outlet, useLocation } from "react-router-dom";

import PageLayout from "@/components/layout/PageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { ERP_INVENTORY_COUNT_TABS } from "../../erpInventoryCountTabs";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { erpTabIndicator, erpTabLink } from "./theme";

/** ERP inventory — admin module shell (mockup-aligned tabs + PageLayout). */
export default function InventoryLayout() {
  const { pathname } = useLocation();
  const onWizard = pathname.startsWith(erpInventoryCountPaths.wizard);

  const primaryAction = !onWizard ? (
    <NavLink
      to={erpInventoryCountPaths.wizard}
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
    >
      Nowa inwentaryzacja
    </NavLink>
  ) : null;

  return (
    <PageLayout fullBleed cardClassName="relative min-h-[600px] w-full">
      <div className="min-w-0">
        <PageHeader
          title="Inwentaryzacja magazynowa"
          subtitle="Planowanie, zatwierdzanie i raporty — liczenie w terminalu WMS."
          actions={primaryAction}
          breadcrumbs={[
            { label: "Magazyn", to: "/inventory" },
            { label: "Inwentaryzacja magazynowa" },
          ]}
          className="space-y-2"
        />

        <nav
          className="mt-3 flex gap-6 border-b border-slate-200 pt-2 text-sm"
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

        <div className="min-w-0 pt-6">
          <Outlet />
        </div>
      </div>
    </PageLayout>
  );
}
