import { memo } from "react";
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
import { NavLink, useLocation } from "react-router-dom";

import { isWmsTabPathActive, type WmsTabConfigItem } from "../../pages/wms/wmsTabConfig";
import { WMS_HOME_PRIMARY } from "../../pages/wms/launcher/wmsHomeSections";

type Props = {
  tabs: WmsTabConfigItem[];
  className?: string;
  onReorder?: (activeId: string, overId: string) => void;
};

const ACTIVE_BG = "#f5f8ff";

const TabLink = memo(function TabLink({ tab, active }: { tab: WmsTabConfigItem; active: boolean }) {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.path}
      title={tab.label}
      className={[
        "inline-flex h-11 shrink-0 items-center gap-2.5 self-center whitespace-nowrap rounded-[10px] border px-3.5 text-[15px] font-semibold transition-colors",
        active ? "" : "border-transparent text-slate-600 hover:text-[#5a4fcf]",
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

  const content = tabs.map((tab) => (
    <SortableTab
      key={tab.id}
      tab={tab}
      active={isWmsTabPathActive(pathname, tab)}
      draggable={Boolean(onReorder)}
    />
  ));

  const navClass = ["flex h-full items-center gap-2", className].filter(Boolean).join(" ");

  if (!onReorder) {
    return (
      <div className={navClass}>
        {tabs.map((tab) => (
          <TabLink key={tab.id} tab={tab} active={isWmsTabPathActive(pathname, tab)} />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
        <div className={navClass}>{content}</div>
      </SortableContext>
    </DndContext>
  );
}

export default memo(WmsTopBarModuleNav);
