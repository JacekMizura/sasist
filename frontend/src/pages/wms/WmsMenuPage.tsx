import { ArrowLeft, Menu, Building2, LogOut } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import WmsTopBarModuleNav from "../../components/wms/WmsTopBarModuleNav";
import WmsModeCard from "../../components/wms/WmsModeCard";
import GlobalWarehouseSelect from "../../components/layout/GlobalWarehouseSelect";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsPinnedModes } from "../../hooks/useWmsPinnedModes";
import { isWmsTabPathActive } from "./wmsTabConfig";
import { WMS_ROUTES } from "./wmsRoutes";

/**
 * WMS dashboard — tile grid for every registered module (Przyjęcie, Produkcja, …).
 */
export default function WmsMenuPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { showWarehouseSelector, warehouse } = useWarehouse();
  const { visibleNavTabs, dashboardTiles, isPinned, togglePin } = useWmsPinnedModes(user?.id ?? null);

  const userLabel = user != null ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.login : "Gość";
  const warehouseLine = warehouse?.name?.trim() || "—";

  const handleBack = () => navigate(-1);

  const onLogout = () => {
    void (async () => {
      await logout();
      navigate("/login", { replace: true });
    })();
  };

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-white font-sans text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 py-3 backdrop-blur-xl shadow-sm">
        <div className="flex w-full items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1">
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              title="Wstecz"
              onClick={handleBack}
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2} />
            </button>

            <NavLink
              to={WMS_ROUTES.menu}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors ml-1"
              title="WMS Menu"
            >
              <Menu className="h-5 w-5" strokeWidth={2} />
            </NavLink>

            <div className="mx-2 h-5 w-px bg-slate-200 shrink-0" />

            <nav className="flex h-10 min-h-[40px] flex-1 items-center overflow-x-auto no-scrollbar">
              <WmsTopBarModuleNav tabs={visibleNavTabs} />
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-4 text-sm shrink-0 border-l border-slate-200 pl-4 bg-white z-10">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-[#5a4fcf] font-black text-xs border border-indigo-200/50">
                {userLabel.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black leading-none text-slate-800">{userLabel}</span>
                <span className="text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">{user?.login || "GUEST"}</span>
              </div>
            </div>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <div className="flex items-center gap-2.5 text-slate-500">
              <Building2 size={16} />
              <span className="font-medium text-slate-700">{warehouseLine}</span>
            </div>
            {showWarehouseSelector ? (
              <div className="w-48 ml-2">
                <GlobalWarehouseSelect variant="topbar" className="w-full text-sm" />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="animate-in fade-in flex-1 flex flex-col items-center justify-center p-6 sm:p-10 lg:p-12 w-full">
        <div className="w-full max-w-[1400px]">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Terminal WMS</h1>
            <p className="mt-1 text-sm text-slate-500">Wybierz moduł operacyjny</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {dashboardTiles.map((tab) => (
              <WmsModeCard
                key={tab.id}
                tab={tab}
                pinned={isPinned(tab.id)}
                routeActive={isWmsTabPathActive(pathname, tab)}
                onTogglePin={() => togglePin(tab.id)}
              />
            ))}
          </div>

          {dashboardTiles.length === 0 ? (
            <p className="mt-8 text-center text-sm text-slate-500">
              Brak dostępnych modułów WMS dla tego użytkownika.
            </p>
          ) : null}
        </div>

        <div className="mt-16 text-center">
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-xs font-black uppercase tracking-widest transition-colors active:scale-95"
          >
            <LogOut size={16} strokeWidth={2.5} />
            Wyloguj sesję
          </button>
        </div>
      </main>
    </div>
  );
}
