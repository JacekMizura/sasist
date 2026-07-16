import { Outlet, useLocation } from "react-router-dom";

import { flatSectionDividerClass, moduleAutomationShellClass } from "../../components/layout/flatSectionTokens";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { TabsNav } from "../../components/layout/TabsNav";

const AUTOMATION_TABS = [
  { path: "/orders/automation/logs", label: "Historia wykonań", end: true as const },
  { path: "/orders/automation/inventory", label: "Akcje dla asortymentu", end: false as const },
  { path: "/orders/automation/orders", label: "Akcje dla zamówień", end: false as const },
  { path: "/orders/automation/groups", label: "Grupy akcji", end: true as const },
  { path: "/orders/automation/settings", label: "Ustawienia", end: true as const },
];

/** Shell automatyzacji — breadcrumb → zakładki → treść (bez pośredniego h1 / opisu). */
export default function OrderAutomationModuleShell() {
  const { pathname } = useLocation();
  const onEditor =
    pathname.includes("/automation/orders/new") ||
    pathname.includes("/automation/inventory/new") ||
    /\/automation\/orders\/[^/]+\/edit/.test(pathname) ||
    /\/automation\/inventory\/[^/]+\/edit/.test(pathname);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      {!onEditor ? (
        <div className={`${moduleAutomationShellClass} shrink-0 pb-4`}>
          <ModuleListBreadcrumb
            items={[
              { label: "Zamówienia", to: "/orders/list" },
              { label: "Akcje automatyczne" },
            ]}
          />
          <TabsNav
            items={AUTOMATION_TABS}
            aria-label="Akcje automatyczne — zakładki"
            tabSize="comfortable"
            className="gap-8 border-0"
          />
          <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
        </div>
      ) : null}
      <div className={`${moduleAutomationShellClass} min-h-0 flex-1 pb-6`}>
        <Outlet />
      </div>
    </div>
  );
}
