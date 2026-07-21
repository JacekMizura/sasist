import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { isWmsTabPathActive, resolveWmsModuleAccent, type WmsTabConfigItem } from "../../pages/wms/wmsTabConfig";
import { WMS_HOME_PRIMARY } from "../../pages/wms/launcher/wmsHomeSections";

type Props = {
  tabs: WmsTabConfigItem[];
  className?: string;
  onReorder?: (activeId: string, overId: string) => void;
};

const ACTIVE_BG = "#f5f8ff";
/** Approx width budget per tab before overflow menu (label + icon + padding). */
const TAB_WIDTH_EST = 168;
const MORE_WIDTH = 96;

const TabLink = memo(function TabLink({ tab, active }: { tab: WmsTabConfigItem; active: boolean }) {
  const Icon = tab.icon;
  const accent = resolveWmsModuleAccent(tab.id);
  return (
    <NavLink
      to={tab.path}
      title={tab.label}
      className={[
        "inline-flex h-11 shrink-0 items-center gap-2.5 self-center whitespace-nowrap rounded-[10px] border px-3.5 text-[15px] font-semibold transition-colors",
        active ? "" : "border-transparent text-slate-600 hover:bg-slate-50",
      ].join(" ")}
      style={
        active
          ? {
              backgroundColor: ACTIVE_BG,
              color: WMS_HOME_PRIMARY,
              borderColor: "rgba(90, 79, 207, 0.35)",
            }
          : undefined
      }
    >
      <Icon
        size={22}
        strokeWidth={2.25}
        aria-hidden
        className={active ? undefined : accent.iconText}
        style={active ? { color: WMS_HOME_PRIMARY } : undefined}
      />
      <span className="whitespace-nowrap">{tab.label}</span>
    </NavLink>
  );
});

const SortableTab = memo(function SortableTab({
  tab,
  active,
  draggable,
}: {
  tab: WmsTabConfigItem;
  active: boolean;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    disabled: !draggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : undefined,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex h-full shrink-0 items-stretch"
      {...(draggable ? { ...attributes, ...listeners } : {})}
    >
      <TabLink tab={tab} active={active} />
    </div>
  );
});

function WmsTopBarModuleNav({ tabs, className, onReorder }: Props) {
  const { pathname } = useLocation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const [moreOpen, setMoreOpen] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (width <= 0 || tabs.length === 0) {
        setVisibleCount(tabs.length);
        return;
      }
      let fit = Math.max(1, Math.floor(width / TAB_WIDTH_EST));
      if (fit < tabs.length) {
        fit = Math.max(0, Math.floor((width - MORE_WIDTH) / TAB_WIDTH_EST));
      }
      setVisibleCount(Math.min(tabs.length, fit));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname, tabs]);

  const { primary, overflow } = useMemo(() => {
    if (visibleCount >= tabs.length) return { primary: tabs, overflow: [] as WmsTabConfigItem[] };
    return {
      primary: tabs.slice(0, visibleCount),
      overflow: tabs.slice(visibleCount),
    };
  }, [tabs, visibleCount]);

  if (tabs.length === 0) {
    return (
      <span className="inline-flex h-full items-center px-4 text-sm text-slate-500">
        Przypnij moduły w menu startowym
      </span>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    onReorder(String(active.id), String(over.id));
  };

  const navClass = ["flex h-full min-w-0 flex-1 items-center gap-2", className].filter(Boolean).join(" ");

  const renderTabs = (list: WmsTabConfigItem[], sortable: boolean) =>
    list.map((tab) =>
      sortable ? (
        <SortableTab
          key={tab.id}
          tab={tab}
          active={isWmsTabPathActive(pathname, tab)}
          draggable={Boolean(onReorder)}
        />
      ) : (
        <TabLink key={tab.id} tab={tab} active={isWmsTabPathActive(pathname, tab)} />
      ),
    );

  const moreMenu =
    overflow.length > 0 ? (
      <div className="relative shrink-0 self-center">
        <button
          type="button"
          className="inline-flex h-11 items-center gap-1 rounded-[10px] border border-transparent px-3 text-[15px] font-semibold text-slate-600 hover:bg-slate-50"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen((v) => !v)}
        >
          Więcej
          <ChevronDown size={16} aria-hidden />
        </button>
        {moreOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            {overflow.map((tab) => {
              const Icon = tab.icon;
              const accent = resolveWmsModuleAccent(tab.id);
              const active = isWmsTabPathActive(pathname, tab);
              return (
                <NavLink
                  key={tab.id}
                  to={tab.path}
                  role="menuitem"
                  onClick={() => setMoreOpen(false)}
                  className={[
                    "flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold",
                    active ? "bg-[#f5f8ff] text-[#5a4fcf]" : "text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <Icon size={18} strokeWidth={2.25} className={active ? undefined : accent.iconText} aria-hidden />
                  {tab.label}
                </NavLink>
              );
            })}
          </div>
        ) : null}
      </div>
    ) : null;

  const body = (
    <div ref={containerRef} className={navClass}>
      {renderTabs(primary, Boolean(onReorder))}
      {moreMenu}
    </div>
  );

  if (!onReorder) return body;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={primary.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        {body}
      </SortableContext>
    </DndContext>
  );
}

export default memo(WmsTopBarModuleNav);
