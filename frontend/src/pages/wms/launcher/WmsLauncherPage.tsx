import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";
import { useWarehouse } from "@/context/WarehouseContext";
import { useWmsPinnedModes } from "@/hooks/useWmsPinnedModes";
import { getWmsModule, isWmsTabPathActive, type WmsTabConfigItem } from "../wmsTabConfig";
import WmsModuleTile from "./WmsModuleTile";
import { useWmsLauncherBadges } from "./useWmsLauncherBadges";

const DEFAULT_DESCRIPTION = "Moduł operacyjny";

const GRID_GAP_PX = 24;
const GRID_H_PADDING_PX = 80;

function estimateGridColumnCount(viewportWidth: number): number {
  const available = Math.max(0, viewportWidth - GRID_H_PADDING_PX);
  const minColPx = 26 * 16;
  return Math.max(1, Math.floor((available + GRID_GAP_PX) / (minColPx + GRID_GAP_PX)));
}

const LAUNCHER_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(26rem,1fr))] gap-5 xl:gap-6";

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

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

type LauncherTileProps = {
  tab: WmsTabConfigItem;
  index: number;
  description: string;
  pinned: boolean;
  pinIdx: number | undefined;
  focused: boolean;
  activeRoute: boolean;
  metrics: ReturnType<typeof useWmsLauncherBadges>["metrics"];
  pinnedCount: number;
  tileRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
  onActivate: (path: string) => void;
  onTogglePin: (id: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
};

const PlainLauncherTile = memo(function PlainLauncherTile(props: Omit<LauncherTileProps, "sortable">) {
  const {
    tab,
    index,
    description,
    pinned,
    pinIdx,
    focused,
    activeRoute,
    metrics,
    pinnedCount,
    tileRefs,
    onActivate,
    onTogglePin,
    onMoveLeft,
    onMoveRight,
  } = props;

  return (
    <div role="listitem" className="min-w-0">
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
        focused={focused}
        activeRoute={activeRoute}
        canMoveLeft={pinned && pinIdx != null && pinIdx > 0}
        canMoveRight={pinned && pinIdx != null && pinIdx < pinnedCount - 1}
        onActivate={() => onActivate(tab.path)}
        onTogglePin={() => onTogglePin(tab.id)}
        onMoveLeft={() => onMoveLeft(tab.id)}
        onMoveRight={() => onMoveRight(tab.id)}
      />
    </div>
  );
});

const SortableLauncherTile = memo(function SortableLauncherTile(props: Omit<LauncherTileProps, "sortable">) {
  const {
    tab,
    index,
    description,
    pinned,
    pinIdx,
    focused,
    activeRoute,
    metrics,
    pinnedCount,
    tileRefs,
    onActivate,
    onTogglePin,
    onMoveLeft,
    onMoveRight,
  } = props;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.92 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} role="listitem" className="min-w-0">
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
        focused={focused}
        activeRoute={activeRoute}
        canMoveLeft={pinned && pinIdx != null && pinIdx > 0}
        canMoveRight={pinned && pinIdx != null && pinIdx < pinnedCount - 1}
        dragHandleProps={{ ...attributes, ...listeners }}
        onActivate={() => onActivate(tab.path)}
        onTogglePin={() => onTogglePin(tab.id)}
        onMoveLeft={() => onMoveLeft(tab.id)}
        onMoveRight={() => onMoveRight(tab.id)}
      />
    </div>
  );
});

/** Launcher modułów WMS — command center, przypinanie, DnD kolejności paska. */
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
    reorderPinned,
  } = useWmsPinnedModes(user?.id ?? null);
  const { metrics } = useWmsLauncherBadges(warehouse?.id ?? null);

  const searchRef = useRef<HTMLInputElement>(null);
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [query, setQuery] = useState("");

  const pinnedIds = useMemo(() => pinnedTabsInOrder.map((t) => t.id), [pinnedTabsInOrder]);
  const sortedTiles = useMemo(
    () => sortTilesForLauncher(dashboardTiles, pinnedIds),
    [dashboardTiles, pinnedIds],
  );

  const filteredTiles = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return sortedTiles;
    return sortedTiles.filter((tab) => {
      const moduleDef = getWmsModule(tab.id);
      const haystack = [tab.label, moduleDef?.shortDescription ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [query, sortedTiles]);

  const pinnedTiles = useMemo(() => filteredTiles.filter((t) => isPinned(t.id)), [filteredTiles, isPinned]);
  const unpinnedTiles = useMemo(() => filteredTiles.filter((t) => !isPinned(t.id)), [filteredTiles, isPinned]);
  const displayTiles = useMemo(() => [...pinnedTiles, ...unpinnedTiles], [pinnedTiles, unpinnedTiles]);

  const pinnedIndexById = useMemo(() => {
    const map = new Map<string, number>();
    pinnedTabsInOrder.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [pinnedTabsInOrder]);

  const openModule = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  const columnCount = useCallback(() => {
    if (typeof window === "undefined") return 5;
    return estimateGridColumnCount(window.innerWidth);
  }, []);

  useEffect(() => {
    tileRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, displayTiles.length]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [displayTiles.length, query]);

  useEffect(() => {
    const onGlobalKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = target?.closest("input, textarea, select, [contenteditable=true]");
      if (inField) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const onPinnedDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorderPinned(String(active.id), String(over.id));
    },
    [reorderPinned],
  );

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const count = displayTiles.length;
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
        event.preventDefault();
        openModule(displayTiles[focusedIndex].path);
        return;
      case "Escape":
        if (query) {
          event.preventDefault();
          setQuery("");
          searchRef.current?.blur();
        }
        return;
      default:
        return;
    }

    event.preventDefault();
    setFocusedIndex(next);
  };

  const renderTile = (tab: WmsTabConfigItem, index: number, sortable: boolean) => {
    const moduleDef = getWmsModule(tab.id);
    const description = moduleDef?.shortDescription?.trim() || DEFAULT_DESCRIPTION;
    const pinned = isPinned(tab.id);
    const pinIdx = pinnedIndexById.get(tab.id);
    const tileProps: Omit<LauncherTileProps, "sortable"> = {
      tab,
      index,
      description,
      pinned,
      pinIdx,
      focused: focusedIndex === index,
      activeRoute: isWmsTabPathActive(pathname, tab),
      metrics,
      pinnedCount: pinnedTabsInOrder.length,
      tileRefs,
      onActivate: openModule,
      onTogglePin: togglePin,
      onMoveLeft: (id) => movePinned(id, -1),
      onMoveRight: (id) => movePinned(id, 1),
    };
    return sortable ? (
      <SortableLauncherTile key={tab.id} {...tileProps} />
    ) : (
      <PlainLauncherTile key={tab.id} {...tileProps} />
    );
  };

  return (
    <div className="min-h-full bg-slate-50/50">
      <div className="w-full px-6 py-5 lg:px-8 lg:py-6 xl:px-10">
        <div className="mb-6 flex items-center gap-3">
          <div className="relative min-w-0 max-w-2xl flex-1">
            <Search
              size={20}
              strokeWidth={2}
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj modułu…"
              aria-label="Szukaj modułu WMS"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-16 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm transition-colors focus:border-orange-400/60 focus:outline-none focus:ring-2 focus:ring-orange-400/15"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-400 lg:inline">
              /
            </kbd>
          </div>
          <span className="hidden shrink-0 text-xs text-slate-400 xl:inline">
            ↑↓←→ · Enter · Esc
          </span>
        </div>

        {displayTiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-8 py-14 text-center">
            <p className="text-sm font-medium text-slate-600">
              {sortedTiles.length === 0 ? "Brak modułów WMS dla tego użytkownika." : "Brak wyników wyszukiwania."}
            </p>
          </div>
        ) : (
          <div role="list" tabIndex={0} onKeyDown={onGridKeyDown} className="space-y-6 focus:outline-none">
            {pinnedTiles.length > 0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPinnedDragEnd}>
                <SortableContext items={pinnedTiles.map((t) => t.id)} strategy={rectSortingStrategy}>
                  <div className={LAUNCHER_GRID_CLASS}>
                    {pinnedTiles.map((tab, i) => renderTile(tab, i, true))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : null}

            {unpinnedTiles.length > 0 ? (
              <div className={[LAUNCHER_GRID_CLASS, pinnedTiles.length > 0 ? "pt-1" : ""].join(" ")}>
                {unpinnedTiles.map((tab, i) => renderTile(tab, pinnedTiles.length + i, false))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
