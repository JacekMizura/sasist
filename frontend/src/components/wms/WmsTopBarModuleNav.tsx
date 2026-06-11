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
import { GripVertical } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { isWmsTabPathActive, type WmsTabConfigItem } from "../../pages/wms/wmsTabConfig";

type Props = {
  tabs: WmsTabConfigItem[];
  className?: string;
  onReorder?: (activeId: string, overId: string) => void;
};

const TabLink = memo(function TabLink({ tab, active }: { tab: WmsTabConfigItem; active: boolean }) {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.path}
      title={tab.label}
      className={[
        "inline-flex h-full shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-1 text-sm font-medium transition-colors sm:px-4",
        active
          ? "border-orange-500 bg-orange-50/70 text-slate-800"
          : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700",
      ].join(" ")}
    >
      <Icon size={18} strokeWidth={2} aria-hidden className={active ? "text-orange-500" : "text-slate-400"} />
      <span className="max-w-[8rem] truncate sm:max-w-none">{tab.label}</span>
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
    <div ref={setNodeRef} style={style} className="flex h-full shrink-0 items-stretch">
      {draggable ? (
        <button
          type="button"
          className="mr-0.5 hidden cursor-grab touch-none self-center rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:text-slate-500 group-hover/pinned-nav:opacity-100 active:cursor-grabbing md:inline-flex"
          aria-label={`Zmień kolejność: ${tab.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
      <TabLink tab={tab} active={active} />
    </div>
  );
});

function WmsTopBarModuleNav({ tabs, className, onReorder }: Props) {
  const { pathname } = useLocation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (tabs.length === 0) {
    return (
      <span className="inline-flex h-full items-center px-4 text-sm text-slate-400">
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

  const navClass = ["group/pinned-nav flex h-full items-stretch", className].filter(Boolean).join(" ");

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
