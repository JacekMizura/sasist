import { useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";

import type { InventoryTaskCompact } from "@/api/inventoryCountApi";
import { useVirtualList } from "../hooks/useVirtualList";
import { TaskQueueHeader, TaskRow } from "./WmsInventoryTaskRow";
import { TASK_ROW_HEIGHT, WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  items: InventoryTaskCompact[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelectTask: (task: InventoryTaskCompact) => void;
  selectedTaskId?: number | null;
};

export default function WmsInventoryTaskQueue({
  items,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onSelectTask,
  selectedTaskId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { virtualItems, totalHeight, onScroll } = useVirtualList(items, containerRef, {
    itemHeight: TASK_ROW_HEIGHT,
    overscan: 12,
  });

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    onScroll(el);
    if (hasMore && !loadingMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore, onScroll]);

  if (loading && items.length === 0) {
    return (
      <div className={`flex items-center justify-center gap-2 py-16 ${WMS_INV.textMuted}`}>
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie kolejki…
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className={`rounded-lg border-2 border-dashed ${WMS_INV.border} ${WMS_INV.surface} py-16 text-center ${WMS_INV.textMuted}`}>
        Brak zadań dla wybranych filtrów
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg border-2 ${WMS_INV.border} ${WMS_INV.surface} shadow-sm`}>
      <TaskQueueHeader />
      <div ref={containerRef} className="max-h-[min(70vh,640px)] overflow-auto" onScroll={handleScroll}>
        <div style={{ height: totalHeight, position: "relative" }}>
          {virtualItems.map(({ item, index, offsetTop }) => (
            <div key={item.id} style={{ position: "absolute", top: offsetTop, left: 0, right: 0 }}>
              <TaskRow
                task={item}
                active={selectedTaskId === item.id}
                onSelect={() => onSelectTask(item)}
              />
            </div>
          ))}
        </div>
      </div>
      {loadingMore ? (
        <div className={`border-t ${WMS_INV.border} py-2 text-center text-xs ${WMS_INV.textMuted}`}>
          <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
          Ładowanie…
        </div>
      ) : null}
      {!hasMore && items.length > 0 ? (
        <div className={`border-t ${WMS_INV.border} py-2 text-center text-xs ${WMS_INV.textMuted}`}>
          {items.length} zadań
        </div>
      ) : null}
    </div>
  );
}
