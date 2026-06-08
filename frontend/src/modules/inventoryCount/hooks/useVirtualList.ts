import { useCallback, useMemo, useState, type RefObject } from "react";

type UseVirtualListOptions = {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
};

export function useVirtualList<T>(
  items: T[],
  containerRef: RefObject<HTMLElement | null>,
  { itemHeight, overscan = 8 }: Omit<UseVirtualListOptions, "itemCount">,
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  const onScroll = useCallback((el: HTMLElement) => {
    setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
  }, []);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const virtualItems = useMemo(
    () =>
      items.slice(startIndex, endIndex).map((item, i) => ({
        item,
        index: startIndex + i,
        offsetTop: (startIndex + i) * itemHeight,
      })),
    [items, startIndex, endIndex, itemHeight],
  );

  return { virtualItems, totalHeight, onScroll, startIndex };
}
