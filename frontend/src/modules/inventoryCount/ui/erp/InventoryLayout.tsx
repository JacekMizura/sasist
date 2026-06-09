import { Link, Outlet, useLocation } from "react-router-dom";

import PageLayout from "@/components/layout/PageLayout";
import { SettingsModuleStack } from "@/components/layout/SettingsModuleStack";
import { ERP_INVENTORY_COUNT_TABS } from "../../erpInventoryCountTabs";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";

/** ERP inventory — same page shell as Producenci / Administratorzy (PageLayout + module stack). */
export default function InventoryLayout() {
  const { pathname } = useLocation();
  const onWizard = pathname.startsWith(erpInventoryCountPaths.wizard);

  const primaryAction = !onWizard ? (
    <Link
      to={erpInventoryCountPaths.wizard}
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
    >
      Nowa inwentaryzacja
    </Link>
  ) : null;

  return (
    <PageLayout fullBleed cardClassName="relative min-h-[600px] w-full">
      <SettingsModuleStack
        breadcrumbs={[
          { label: "Magazyn", to: "/inventory" },
          { label: "Inwentaryzacja magazynowa" },
        ]}
        title="Inwentaryzacja magazynowa"
        description="Planowanie, zatwierdzanie i raporty — liczenie w terminalu WMS."
        actions={primaryAction}
        tabs={ERP_INVENTORY_COUNT_TABS}
        tabsExact={false}
        tabsAriaLabel="Inwentaryzacja magazynowa"
      >
        <Outlet />
      </SettingsModuleStack>
    </PageLayout>
  );
}
