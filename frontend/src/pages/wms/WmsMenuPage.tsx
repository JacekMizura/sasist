import { useCallback, useState } from "react";
import { ArrowLeft, Menu, Building2, LogOut, Pin, GripHorizontal, X } from "lucide-react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";

import GlobalWarehouseSelect from "../../components/layout/GlobalWarehouseSelect";
import { useAuth } from "../../context/AuthContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsPinnedModes } from "../../hooks/useWmsPinnedModes";
import { WMS_TAB_ITEMS, isWmsTabPathActive } from "./wmsTabConfig";
import { WMS_ROUTES } from "./wmsRoutes";

/**
 * Nowoczesny, minimalistyczny kafelek trybu (Dashboard Card)
 */
function ModernModeCard({ tab, pinned, routeActive, onTogglePin }: any) {
  const Icon = tab.icon;
  
  return (
    <Link
      to={tab.path}
      className={`group relative flex flex-col items-center text-center rounded-[2rem] border-2 p-8 transition-all h-full ${
        routeActive 
          ? "border-[#5a4fcf] bg-indigo-50/30 shadow-md" 
          : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-md hover:-translate-y-0.5"
      }`}
    >
      {/* Przycisk Pin */}
      <button 
        type="button"
        onClick={(e) => { 
          e.preventDefault(); 
          e.stopPropagation(); 
          onTogglePin(); 
        }}
        className={`absolute right-4 top-4 p-2.5 rounded-full transition-all z-10 ${
          pinned 
            ? "text-[#5a4fcf] bg-indigo-50 hover:bg-indigo-100" 
            : "text-slate-300 hover:text-slate-500 hover:bg-slate-50 opacity-0 group-hover:opacity-100 focus:opacity-100"
        }`}
        title={pinned ? "Odepnij" : "Przypnij do paska"}
      >
        <Pin size={20} className={pinned ? "fill-current" : ""} />
      </button>

      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 duration-300 ${
        routeActive 
          ? "bg-[#5a4fcf] text-white shadow-lg shadow-indigo-500/30" 
          : "bg-slate-50 text-slate-500 border border-slate-100 group-hover:text-[#5a4fcf] group-hover:border-indigo-100"
      }`}>
        <Icon size={36} strokeWidth={2} />
      </div>

      <h3 className={`text-[15px] font-black uppercase tracking-wide leading-snug ${
        routeActive ? "text-[#5a4fcf]" : "text-slate-800"
      }`}>
        {tab.label}
      </h3>
    </Link>
  );
}

/**
 * Pełnoekranowy launcher trybów WMS (`/wms/menu`)
 */
export default function WmsMenuPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { showWarehouseSelector, warehouse } = useWarehouse();
  const { pinnedTabsInOrder, isPinned, togglePin, movePinned } = useWmsPinnedModes(user?.id ?? null);

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const userLabel = user != null ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.login : "Gość";
  const warehouseLine = warehouse?.name?.trim() || "—";

  const handleBack = () => navigate(-1);

  const onLogout = () => {
    void (async () => {
      await logout();
      navigate("/login", { replace: true });
    })();
  };

  // Obsługa przeciągania na górnym pasku
  const handleDrop = useCallback((targetIdx: number) => {
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null);
      return;
    }
    
    // Obliczamy ile kroków i w którym kierunku trzeba przesunąć element
    // Używamy istniejącej w hooku funkcji movePinned(id, direction: -1 | 1)
    const tabId = pinnedTabsInOrder[draggedIdx].id;
    const diff = targetIdx - draggedIdx;
    const step = diff > 0 ? 1 : -1;
    const stepsCount = Math.abs(diff);

    for (let i = 0; i < stepsCount; i++) {
      movePinned(tabId, step);
    }
    
    setDraggedIdx(null);
  }, [draggedIdx, pinnedTabsInOrder, movePinned]);

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-white font-sans text-slate-900">
      
      {/* HEADER: Zwarty, przyklejony pasek nawigacyjny z Drag & Drop */}
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
              to={WMS_ROUTES.root}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors ml-1"
              title="WMS Menu"
            >
              <Menu className="h-5 w-5" strokeWidth={2} />
            </NavLink>

            <div className="mx-2 h-5 w-px bg-slate-200 shrink-0"></div>

            {/* Przypięte zakładki (Draggable) */}
            <nav className="flex items-center gap-1.5 min-h-[40px]">
              {pinnedTabsInOrder.length === 0 ? (
                <span className="text-xs font-bold text-slate-400 italic px-2">
                  Brak przypiętych modułów. Przypnij z siatki poniżej.
                </span>
              ) : (
                pinnedTabsInOrder.map((tab, idx) => {
                  const isActive = isWmsTabPathActive(pathname, tab);
                  
                  return (
                    <div
                      key={tab.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedIdx(idx);
                        e.dataTransfer.effectAllowed = 'move';
                        // Minimalne opóźnienie dla ghost image
                        setTimeout(() => (e.target as HTMLElement).classList.add('opacity-40'), 0);
                      }}
                      onDragEnd={(e) => {
                        setDraggedIdx(null);
                        (e.target as HTMLElement).classList.remove('opacity-40');
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(idx);
                      }}
                      className="relative group flex items-center"
                    >
                      <NavLink
                        to={tab.path}
                        className={`flex items-center gap-2 pl-3 pr-2 py-2 text-sm font-bold border border-transparent rounded-xl whitespace-nowrap transition-colors cursor-grab active:cursor-grabbing select-none ${
                          isActive 
                            ? "bg-indigo-50/50 text-[#5a4fcf] shadow-sm border-[#5a4fcf]/20" 
                            : "bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-200"
                        }`}
                      >
                        <GripHorizontal size={14} className={`shrink-0 ${isActive ? "text-indigo-300" : "text-slate-300 group-hover:text-slate-500"}`} />
                        <span className="hover:text-slate-900">{tab.label}</span>
                        
                        {/* Przycisk odpięcia wewnąrz zakładki */}
                        <button
                          type="button"
                          onClick={(e) => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            togglePin(tab.id); 
                          }}
                          className={`w-5 h-5 flex items-center justify-center rounded-md transition-all ml-1 opacity-0 group-hover:opacity-100 ${
                            isActive ? "text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700" : "text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                          }`}
                          title="Odepnij"
                        >
                          <X size={14} strokeWidth={3} />
                        </button>
                      </NavLink>
                    </div>
                  );
                })
              )}
            </nav>
          </div>

          {/* Użytkownik i Magazyn po prawej */}
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
            <div className="h-6 w-px bg-slate-200 mx-1"></div>
            <div className="flex items-center gap-2.5 text-slate-500">
              <Building2 size={16} />
              <span className="font-medium text-slate-700">{warehouseLine}</span>
            </div>
            {showWarehouseSelector && (
              <div className="w-48 ml-2">
                <GlobalWarehouseSelect variant="topbar" className="w-full text-sm" />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* GŁÓWNA ZAWARTOŚĆ (Czysta Siatka) */}
      <main className="animate-in fade-in flex-1 flex flex-col items-center justify-center p-6 sm:p-10 lg:p-12 w-full">
        
        <div className="w-full max-w-[1400px]">
          {/* Siatka skalująca się na pełną szerokość */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
            {WMS_TAB_ITEMS.map((tab) => (
              <div key={tab.id}>
                <ModernModeCard
                  tab={tab}
                  pinned={isPinned(tab.id)}
                  routeActive={isWmsTabPathActive(pathname, tab)}
                  onTogglePin={() => togglePin(tab.id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* SUBTELNE WYLOGOWANIE NA DOLE */}
        <div className="mt-16 text-center">
          <button
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