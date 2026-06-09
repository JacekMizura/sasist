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
        "group relative inline-flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium transition-colors duration-200 ease-out",
        active ? "text-slate-900" : "text-slate-500 hover:text-slate-800",
      ].join(" ")}
    >
      <Icon
        size={13}
        strokeWidth={2.25}
        aria-hidden
        className={active ? "text-[#5a4fcf]" : "text-slate-400 transition-colors group-hover:text-slate-600"}
      />
      <span className="max-w-[7.5rem] truncate sm:max-w-[9rem]">{tab.label}</span>
      <span
        aria-hidden
        className={[
          "pointer-events-none absolute -bottom-px left-1 right-1 h-[2px] rounded-full transition-all duration-300 ease-out",
          active
            ? "bg-[#5a4fcf] opacity-100 shadow-[0_0_10px_rgba(90,79,207,0.28)]"
            : "scale-x-75 bg-slate-300 opacity-0 group-hover:scale-x-100 group-hover:opacity-60",
        ].join(" ")}
      />
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
    <div ref={setNodeRef} style={style} className="flex shrink-0 items-center">
      {draggable ? (
        <button
          type="button"
          className="mr-0.5 hidden cursor-grab touch-none rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:text-slate-500 group-hover/pinned-nav:opacity-100 active:cursor-grabbing md:inline-flex"
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
      <span className="hidden px-2 text-[11px] text-slate-400 sm:inline">
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

  const navClass = ["group/pinned-nav flex items-center gap-0.5 overflow-x-auto no-scrollbar", className]
    .filter(Boolean)
    .join(" ");

  if (!onReorder) {
    return <div className={navClass}>{tabs.map((tab) => <TabLink key={tab.id} tab={tab} active={isWmsTabPathActive(pathname, tab)} />)}</div>;
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
