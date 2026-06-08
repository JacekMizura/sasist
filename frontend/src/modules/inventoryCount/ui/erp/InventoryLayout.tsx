import { ChevronRight, Home } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { erpInventoryCountPaths } from "../../inventoryCountPaths";

const TABS = [
  { path: erpInventoryCountPaths.dashboard, label: "Pulpit", end: true },
  { path: erpInventoryCountPaths.documents, label: "Dokumenty", end: false },
  { path: erpInventoryCountPaths.wizard, label: "Nowa inwentaryzacja", end: false },
  { path: erpInventoryCountPaths.reports, label: "Raporty", end: true },
] as const;

/** ERP inventory shell — 1:1 uploaded mockup (breadcrumb, header, orange tabs). */
export default function InventoryLayout() {
  return (
    <div className="min-h-full bg-white font-sans text-slate-900 selection:bg-orange-100 selection:text-orange-900">
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="mb-8 flex items-center space-x-2.5 text-[15px]">
          <Home className="h-[18px] w-[18px] cursor-pointer text-[#5c6873] hover:text-slate-800" strokeWidth={1.5} />
          <ChevronRight className="h-4 w-4 text-[#cbd5e1]" strokeWidth={1.5} />
          <span className="cursor-pointer text-[#206bc4] hover:underline">Magazyn</span>
          <ChevronRight className="h-4 w-4 text-[#cbd5e1]" strokeWidth={1.5} />
          <span className="text-[#206bc4]">Inwentaryzacja magazynowa</span>
        </div>

        <div className="mb-8">
          <h1 className="mb-1 text-2xl font-bold text-slate-900">Inwentaryzacja magazynowa</h1>
          <p className="mb-6 text-sm text-slate-500">
            Planowanie, zatwierdzanie i raporty — liczenie w terminalu WMS.
          </p>

          <div className="border-b border-slate-200">
            <nav className="-mb-px flex space-x-8" aria-label="Inwentaryzacja">
              {TABS.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  end={tab.end}
                  className={({ isActive }) =>
                    `whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-orange-500 text-slate-900"
                        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        <div className="pb-12">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
