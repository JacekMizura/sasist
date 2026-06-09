import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { useWmsPinnedModes } from "@/hooks/useWmsPinnedModes";
import { getWmsModule, isWmsTabPathActive, type WmsTabConfigItem } from "../wmsTabConfig";
import WmsModuleTile from "./WmsModuleTile";
import { useWmsLauncherBadges } from "./useWmsLauncherBadges";
import { useWarehouse } from "@/context/WarehouseContext";

const DEFAULT_DESCRIPTION = "Moduł operacyjny";

function sortTilesForLauncher(tiles: WmsTabConfigItem[], pinnedIds: string[]): WmsTabConfigItem[] {
  const order = new Map(pinnedIds.map((id, i) => [id, i]));
  return [...tiles].sort((a, b) => {
    const aPin = order.has(a.id);
    const bPin = order.has(b.id);
    if (aPin && bPin) return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    if (aPin) return -1;
    if (bPin) return 1;
    return 0;
  });
}

/** Launcher modułów WMS — przypinanie, kolejność paska, bez hero. */
export default function WmsLauncherPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { warehouse } = useWarehouse();
  const {
    dashboardTiles,
    pinnedTabsInOrder,
    isPinned,
    togglePin,
    movePinned,
  } = useWmsPinnedModes(user?.id ?? null);
  const { metrics } = useWmsLauncherBadges(warehouse?.id ?? null);

  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const pinnedIds = useMemo(() => pinnedTabsInOrder.map((t) => t.id), [pinnedTabsInOrder]);
  const sortedTiles = useMemo(
    () => sortTilesForLauncher(dashboardTiles, pinnedIds),
    [dashboardTiles, pinnedIds],
  );

  const openModule = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  const pinnedIndexById = useMemo(() => {
    const map = new Map<string, number>();
    pinnedTabsInOrder.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [pinnedTabsInOrder]);

  const columnCount = () => {
    if (typeof window === "undefined") return 4;
    const w = window.innerWidth;
    if (w < 640) return 2;
    if (w < 1024) return 3;
    return 4;
  };

  useEffect(() => {
    tileRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, sortedTiles.length]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [sortedTiles.length]);

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = sortedTiles.length;
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
        openModule(sortedTiles[focusedIndex].path);
        return;
      default:
        return;
    }

    event.preventDefault();
    setFocusedIndex(next);
  };

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
        {sortedTiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-6 py-14 text-center">
            <p className="text-sm font-semibold text-slate-700">Brak modułów WMS dla tego użytkownika.</p>
          </div>
        ) : (
          <div
            role="list"
            tabIndex={0}
            onKeyDown={onGridKeyDown}
            className="grid grid-cols-2 gap-3 focus:outline-none sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
          >
            {sortedTiles.map((tab, index) => {
              const moduleDef = getWmsModule(tab.id);
              const description = moduleDef?.shortDescription?.trim() || DEFAULT_DESCRIPTION;
              const pinned = isPinned(tab.id);
              const pinIdx = pinnedIndexById.get(tab.id);
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
                    pinned={pinned}
                    focused={focusedIndex === index}
                    activeRoute={isWmsTabPathActive(pathname, tab)}
                    canMoveLeft={pinned && pinIdx != null && pinIdx > 0}
                    canMoveRight={
                      pinned && pinIdx != null && pinIdx < pinnedTabsInOrder.length - 1
                    }
                    onActivate={() => openModule(tab.path)}
                    onTogglePin={() => togglePin(tab.id)}
                    onMoveLeft={() => movePinned(tab.id, -1)}
                    onMoveRight={() => movePinned(tab.id, 1)}
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
