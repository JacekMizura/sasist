import { Link, Outlet, useLocation } from "react-router-dom";
import { Factory, LayoutDashboard, Sparkles } from "lucide-react";

import { TabsNav } from "../../components/layout/TabsNav";
import { PRODUCTION_TABS } from "../../modules/production/productionTabs";
import { PRODUCTION_ACCENT } from "./productionTheme";
import { productionPaths } from "./productionPaths";

/**
 * Dedicated production center shell — ERP/MRP visual identity, not generic WMS.
 */
export default function ProductionModuleLayout() {
  const { pathname } = useLocation();
  const onDashboard = pathname === productionPaths.home || pathname === `${productionPaths.home}/`;

  return (
    <div className={`flex min-h-full flex-col ${PRODUCTION_ACCENT.surface}`}>
      <div className="border-b border-violet-200/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 lg:px-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" aria-hidden />
            <span>Moduł produkcyjny · workflow magazynowy RW/PW</span>
          </div>
          <Link
            to="/wms/menu"
            className="text-xs font-medium text-violet-700 hover:text-violet-900 hover:underline"
          >
            ← Menu WMS
          </Link>
        </div>
      </div>

      <header className={`border-b border-violet-900/20 bg-gradient-to-r ${PRODUCTION_ACCENT.header} text-white shadow-lg`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 shadow-inner ring-1 ring-white/20">
              <Factory className="h-7 w-7 text-violet-100" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">Manufacturing</p>
              <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Centrum produkcji</h1>
            </div>
          </div>
          <Link
            to={productionPaths.home}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
              onDashboard ? "bg-white text-violet-900 shadow-md" : "text-violet-100 ring-1 ring-white/20 hover:bg-white/10",
            ].join(" ")}
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden />
            Pulpit operacyjny
          </Link>
        </div>
        <div className="border-t border-white/10 bg-black/10">
          <div className="mx-auto max-w-7xl px-4 py-3 lg:px-6">
            <TabsNav items={PRODUCTION_TABS} exact={false} variant="segmented" aria-label="Workflow produkcji" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1">
        <Outlet />
      </main>
    </div>
  );
}
