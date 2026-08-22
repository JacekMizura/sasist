import { ChevronDown, RefreshCw } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";
import { tabsNavItemClassName } from "../../../components/layout/TabsNav";
import { pageShellDividerClass } from "../../../design-system/pageLayout";
import { PocztaModuleProvider, usePocztaModuleContext } from "../context/PocztaModuleContext";
import { POCZTA_TABS } from "../pocztaTabs";

function tabHref(path: string, tabLinkSearch: string): string {
  if (!tabLinkSearch) return path;
  return `${path}${tabLinkSearch.startsWith("?") ? tabLinkSearch : `?${tabLinkSearch}`}`;
}

function PocztaTabBar() {
  const location = useLocation();
  const { tenantId, setTenantId, tenants, triggerRefresh } = usePocztaModuleContext();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const tabLinkSearch = useMemo(() => {
    const tid = new URLSearchParams(location.search).get("tenant_id");
    return tid != null && tid !== "" ? `?tenant_id=${encodeURIComponent(tid)}` : "";
  }, [location.search]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    triggerRefresh();
    window.setTimeout(() => setIsRefreshing(false), 800);
  };

  return (
    <div className={`sticky top-0 z-20 -mx-6 bg-white px-6 ${pageShellDividerClass}`}>
      <div className="flex items-center justify-between gap-3 pb-0">
        <nav className="no-scrollbar flex flex-1 items-center gap-6 overflow-x-auto" aria-label="Poczta" role="tablist">
          {POCZTA_TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tabHref(tab.path, tabLinkSearch)}
              end={tab.end ?? tab.path === "/poczta/szablony"}
              role="tab"
              className={({ isActive }) => tabsNavItemClassName(isActive)}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden shrink-0 items-center space-x-4 border-l border-slate-100 pl-4 lg:flex">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-slate-400">Podmiot</span>
            <div className="relative">
              <select
                value={tenantId}
                onChange={(e) => setTenantId(Number(e.target.value))}
                className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-sm hover:border-slate-300"
                aria-label="Podmiot"
              >
                {tenants.length === 0 ? (
                  <option value={tenantId}>#{tenantId}</option>
                ) : (
                  tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:text-blue-600"
            title="Odśwież dane"
            aria-label="Odśwież dane"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PocztaModuleLayoutInner() {
  return (
    <PageLayout fullBleed className="min-w-0">
      <PocztaTabBar />
      <div className="min-w-0 pt-4">
        <Outlet />
      </div>
    </PageLayout>
  );
}

function PocztaModuleLayoutShell() {
  return (
    <PocztaModuleProvider>
      <PocztaModuleLayoutInner />
    </PocztaModuleProvider>
  );
}

export default memo(PocztaModuleLayoutShell);
