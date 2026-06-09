import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { useWarehouse } from "@/context/WarehouseContext";
import { useWmsPinnedModes } from "@/hooks/useWmsPinnedModes";
import { isWmsTabPathActive } from "../wmsTabConfig";
import WmsHeader from "./WmsHeader";
import WmsModuleTile from "./WmsModuleTile";
import { useWmsLauncherBadges } from "./useWmsLauncherBadges";

/**
 * Pełnoekranowy launcher modułów WMS — terminal operacyjny (nie dashboard SaaS).
 */
export default function WmsLauncherPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { warehouse, showWarehouseSelector } = useWarehouse();
  const { dashboardTiles } = useWmsPinnedModes(user?.id ?? null);
  const { badges } = useWmsLauncherBadges(warehouse?.id ?? null);

  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const operatorLabel =
    user != null
      ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.login
      : "Gość";
  const warehouseName = warehouse?.name?.trim() || "Magazyn";

  const openModule = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  const onLogout = () => {
    void (async () => {
      await logout();
      navigate("/login", { replace: true });
    })();
  };

  const columnCount = () => {
    if (typeof window === "undefined") return 4;
    const w = window.innerWidth;
    if (w < 640) return 2;
    if (w < 1024) return 3;
    if (w < 1280) return 4;
    return 5;
  };

  useEffect(() => {
    tileRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, dashboardTiles.length]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [dashboardTiles.length]);

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = dashboardTiles.length;
    if (count === 0) return;

    const cols = columnCount();
    let next = focusedIndex;

    switch (event.key) {
      case "ArrowRight":
        next = Math.min(count - 1, focusedIndex + 1);
        break;
      case "ArrowLeft":
        next = Math.max(0, focusedIndex - 1);
        break;
      case "ArrowDown":
        next = Math.min(count - 1, focusedIndex + cols);
        break;
      case "ArrowUp":
        next = Math.max(0, focusedIndex - cols);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        openModule(dashboardTiles[focusedIndex].path);
        return;
      default:
        return;
    }

    event.preventDefault();
    setFocusedIndex(next);
  };

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-[#e8edf2] font-sans text-slate-900 selection:bg-orange-200">
      <WmsHeader
        warehouseName={warehouseName}
        operatorLabel={operatorLabel}
        operatorLogin={user?.login}
        showWarehouseSelector={showWarehouseSelector}
        onLogout={onLogout}
      />

      <main className="flex-1 px-2 py-3 sm:px-4 sm:py-4">
        <div className="mx-auto w-full max-w-[1600px]">
          <div className="mb-3 flex items-end justify-between gap-3 border-b-2 border-slate-300/80 pb-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Moduły operacyjne</p>
              <p className="text-sm font-bold text-slate-700">Wybierz moduł · strzałki + Enter · duży obszar dotyku</p>
            </div>
            <p className="hidden text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:block">
              {dashboardTiles.length} dostępnych
            </p>
          </div>

          {dashboardTiles.length === 0 ? (
            <p className="border-2 border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm font-bold text-slate-600">
              Brak modułów WMS dla tego użytkownika.
            </p>
          ) : (
            <div
              role="list"
              tabIndex={0}
              onKeyDown={onGridKeyDown}
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-3 focus:outline-none"
            >
              {dashboardTiles.map((tab, index) => (
                <div key={tab.id} role="listitem" className="min-w-0">
                  <WmsModuleTile
                    ref={(el) => {
                      tileRefs.current[index] = el;
                    }}
                    label={tab.label}
                    icon={tab.icon}
                    badge={badges[tab.id]}
                    focused={focusedIndex === index}
                    activeRoute={isWmsTabPathActive(pathname, tab)}
                    onActivate={() => openModule(tab.path)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t-2 border-slate-300 bg-[#dde4eb] px-4 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-600">
        Sasist WMS · terminal operacyjny
      </footer>
    </div>
  );
}
