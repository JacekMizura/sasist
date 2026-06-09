import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { useWarehouse } from "@/context/WarehouseContext";
import { useWmsPinnedModes } from "@/hooks/useWmsPinnedModes";
import { getWmsModule, isWmsTabPathActive } from "../wmsTabConfig";
import WmsModuleTile from "./WmsModuleTile";
import { useWmsLauncherBadges } from "./useWmsLauncherBadges";

const DEFAULT_DESCRIPTION = "Moduł operacyjny magazynu";

/**
 * Ekran startowy WMS — enterprise module grid (spójny z resztą systemu, nie terminal CE).
 */
export default function WmsLauncherPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { warehouse } = useWarehouse();
  const { user } = useAuth();
  const { dashboardTiles } = useWmsPinnedModes(user?.id ?? null);
  const { metrics, loading: metricsLoading } = useWmsLauncherBadges(warehouse?.id ?? null);

  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const warehouseName = warehouse?.name?.trim() || "Magazyn";

  const openModule = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  const columnCount = () => {
    if (typeof window === "undefined") return 4;
    const w = window.innerWidth;
    if (w < 640) return 1;
    if (w < 1024) return 2;
    if (w < 1280) return 3;
    return 4;
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
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="mb-8 lg:mb-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Warehouse Management</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{warehouseName}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
                Moduły operacyjne — wybierz proces, aby rozpocząć pracę.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-500 shadow-sm">
              <LayoutGrid size={14} className="text-slate-400" aria-hidden />
              <span>
                {dashboardTiles.length}{" "}
                {dashboardTiles.length === 1 ? "moduł" : dashboardTiles.length < 5 ? "moduły" : "modułów"}
              </span>
              {metricsLoading ? <Loader2 size={14} className="animate-spin text-slate-400" aria-label="Odświeżanie" /> : null}
            </div>
          </div>
        </header>

        {dashboardTiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-700">Brak modułów WMS dla tego użytkownika.</p>
            <p className="mt-1 text-sm text-slate-500">Skontaktuj się z administratorem, aby nadać uprawnienia operacyjne.</p>
          </div>
        ) : (
          <div
            role="list"
            tabIndex={0}
            onKeyDown={onGridKeyDown}
            className="grid grid-cols-1 gap-5 focus:outline-none sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4"
          >
            {dashboardTiles.map((tab, index) => {
              const moduleDef = getWmsModule(tab.id);
              const description = moduleDef?.shortDescription?.trim() || DEFAULT_DESCRIPTION;
              return (
                <div key={tab.id} role="listitem" className="min-w-0">
                  <WmsModuleTile
                    ref={(el) => {
                      tileRefs.current[index] = el;
                    }}
                    moduleId={tab.id}
                    label={tab.label}
                    description={description}
                    icon={tab.icon}
                    metrics={metrics[tab.id]}
                    focused={focusedIndex === index}
                    activeRoute={isWmsTabPathActive(pathname, tab)}
                    onActivate={() => openModule(tab.path)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
