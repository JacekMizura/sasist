import { Link, Outlet, useLocation } from "react-router-dom";
import { Factory, LayoutDashboard, PackageCheck, ScanLine, Settings2 } from "lucide-react";

import { TabsNav } from "../../components/layout/TabsNav";
import { PRODUCTION_TABS } from "../../modules/production/productionTabs";
import { productionPaths } from "./productionPaths";

/**
 * Dedicated production center shell — distinct from generic WMS operational chrome.
 * Owns dashboard, collecting, execution, and putaway workflows.
 */
export default function ProductionModuleLayout() {
  const { pathname } = useLocation();
  const onDashboard = pathname === productionPaths.home || pathname === `${productionPaths.home}/`;

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="border-b border-violet-200/80 bg-gradient-to-r from-violet-950 via-violet-900 to-indigo-900 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Factory className="h-6 w-6 text-violet-100" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-200/90">Moduł WMS</p>
              <h1 className="text-xl font-bold tracking-tight">Centrum produkcji</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={productionPaths.home}
              className={[
                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                onDashboard ? "bg-white/15 text-white" : "text-violet-100 hover:bg-white/10",
              ].join(" ")}
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              Pulpit
            </Link>
            <Link
              to="/wms/menu"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-white/10"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              Menu WMS
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10 bg-violet-950/40">
          <div className="mx-auto max-w-7xl px-4 py-3 lg:px-6">
            <TabsNav
              items={PRODUCTION_TABS}
              exact={false}
              variant="segmented"
              aria-label="Workflow produkcji"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto hidden w-full max-w-7xl gap-3 px-4 pt-4 text-xs text-slate-500 sm:flex lg:px-6">
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200">
          <ScanLine className="h-3.5 w-3.5 text-amber-600" aria-hidden />
          Zbieranie surowców
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200">
          <Factory className="h-3.5 w-3.5 text-blue-600" aria-hidden />
          Wykonanie
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 shadow-sm ring-1 ring-slate-200">
          <PackageCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          Odłożenie wyrobów
        </span>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-0 pb-8 lg:px-2">
        <Outlet />
      </main>
    </div>
  );
}
