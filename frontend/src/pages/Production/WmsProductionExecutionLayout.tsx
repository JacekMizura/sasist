import { Link, Outlet } from "react-router-dom";
import { Factory, ScanLine } from "lucide-react";

import { TabsNav } from "../../components/layout/TabsNav";
import { WMS_PRODUCTION_TABS } from "../../modules/production/wmsProductionTabs";

/**
 * WMS operator shell — scanner-first execution only (no ERP planning UI).
 */
export default function WmsProductionExecutionLayout() {
  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Factory className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Terminal WMS</p>
            <h1 className="truncate text-base font-bold text-slate-900">Produkcja — wykonanie</h1>
          </div>
          <Link
            to="/wms/menu"
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Menu WMS
          </Link>
        </div>
        <div className="border-t border-slate-100 px-4 pb-3">
          <TabsNav items={WMS_PRODUCTION_TABS} exact={false} variant="segmented" aria-label="Workflow wykonania" />
        </div>
      </header>

      <p className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2 text-xs text-slate-500">
        <ScanLine className="h-3.5 w-3.5 text-amber-600" aria-hidden />
        Planowanie partii i receptury — w module ERP → Produkcja
      </p>

      <main className="mx-auto w-full max-w-3xl flex-1 pb-10">
        <Outlet />
      </main>
    </div>
  );
}
