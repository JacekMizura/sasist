import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Zap } from "lucide-react";

import { TabsNav } from "../../components/layout/TabsNav";
import { oaWorkspaceMax, oaWorkspacePad } from "../../components/orders/automation/orderAutomationUiTokens";

const AUTOMATION_TABS = [
  { path: "/orders/automation/logs", label: "Dziennik zdarzeń", end: true as const },
  { path: "/orders/automation/inventory", label: "Akcje dla asortymentu", end: false as const },
  { path: "/orders/automation/orders", label: "Akcje dla zamówień", end: false as const },
  { path: "/orders/automation/groups", label: "Grupy akcji", end: true as const },
];

export default function OrderAutomationModuleShell() {
  const { pathname } = useLocation();
  const onEditor =
    pathname.includes("/automation/orders/new") ||
    pathname.includes("/automation/inventory/new") ||
    /\/automation\/orders\/[^/]+\/edit/.test(pathname) ||
    /\/automation\/inventory\/[^/]+\/edit/.test(pathname);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <header className="shrink-0 border-b border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">
        <div className={`${oaWorkspaceMax} ${oaWorkspacePad} pt-5 pb-1 lg:pt-6`}>
          <div className="flex min-w-0 flex-wrap items-start gap-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900/[0.06] text-slate-700 ring-1 ring-slate-900/[0.06]">
              <Zap className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-600">
                <NavLink to="/orders/list" className="font-medium text-slate-500 transition hover:text-slate-900">
                  Zamówienia
                </NavLink>
                <span className="text-slate-300">/</span>
                <span className="font-semibold text-slate-800">Akcje automatyczne</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 lg:text-[1.75rem] lg:leading-tight">
                Akcje automatyczne
              </h1>
            </div>
          </div>
        </div>
        {!onEditor ? (
          <div className="border-t border-slate-200 bg-white">
            <div className={`${oaWorkspaceMax} ${oaWorkspacePad} pb-0 pt-2`}>
              <TabsNav
                items={AUTOMATION_TABS}
                aria-label="Akcje automatyczne — zakładki"
                tabSize="comfortable"
                className="gap-8 border-0"
              />
            </div>
            <div className="h-px w-full bg-slate-200" aria-hidden />
          </div>
        ) : null}
      </header>
      <div className={`${oaWorkspaceMax} ${oaWorkspacePad} min-h-0 flex-1 py-3 lg:py-4`}>
        <Outlet />
      </div>
    </div>
  );
}
