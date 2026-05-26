import { useCallback, useEffect, useMemo, useState } from "react";

import { WMS_TAB_ITEMS, type WmsTabConfigItem } from "../pages/wms/wmsTabConfig";
import {
  readWmsPinnedModesFromStorage,
  writeWmsPinnedModesToStorage,
  type WmsPinnedMode,
} from "../pages/wms/wmsPinnedModesStorage";

export type { WmsPinnedMode };

export function useWmsPinnedModes(userId: number | null) {
  const [modes, setModes] = useState<WmsPinnedMode[]>(() => readWmsPinnedModesFromStorage(userId));

  useEffect(() => {
    setModes(readWmsPinnedModesFromStorage(userId));
  }, [userId]);

  useEffect(() => {
    writeWmsPinnedModesToStorage(userId, modes);
  }, [userId, modes]);

  const pinnedTabsInOrder: WmsTabConfigItem[] = useMemo(() => {
    const pinned = modes.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
    return pinned
      .map((m) => WMS_TAB_ITEMS.find((t) => t.id === m.key))
      .filter((t): t is WmsTabConfigItem => Boolean(t));
  }, [modes]);

  const visibleNavTabs: WmsTabConfigItem[] = useMemo(() => {
    if (pinnedTabsInOrder.length > 0) return pinnedTabsInOrder;
    return WMS_TAB_ITEMS;
  }, [pinnedTabsInOrder]);

  const isPinned = useCallback(
    (key: string) => modes.some((m) => m.key === key && m.pinned),
    [modes],
  );

  const togglePin = useCallback((key: string) => {
    setModes((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx === -1) return prev;
      const cur = prev[idx];
      if (cur.pinned) {
        const next = [...prev];
        next[idx] = { ...cur, pinned: false, order: 0 };
        const pinned = next.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
        const orderByKey = new Map<string, number>();
        pinned.forEach((m, i) => orderByKey.set(m.key, i));
        return next.map((m) => (m.pinned ? { ...m, order: orderByKey.get(m.key) ?? m.order } : m));
      }
      const maxOrder = Math.max(-1, ...prev.filter((m) => m.pinned).map((m) => m.order));
      const next = [...prev];
      next[idx] = { ...cur, pinned: true, order: maxOrder + 1 };
      return next;
    });
  }, []);

  const movePinned = useCallback((key: string, delta: -1 | 1) => {
    setModes((prev) => {
      const pinned = prev.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
      const pos = pinned.findIndex((m) => m.key === key);
      if (pos < 0) return prev;
      const swapWith = pos + delta;
      if (swapWith < 0 || swapWith >= pinned.length) return prev;
      const a = pinned[pos];
      const b = pinned[swapWith];
      const orderA = a.order;
      const orderB = b.order;
      return prev.map((m) => {
        if (m.key === a.key) return { ...m, order: orderB };
        if (m.key === b.key) return { ...m, order: orderA };
        return m;
      });
    });
  }, []);

  return {
    modes,
    pinnedTabsInOrder,
    visibleNavTabs,
    isPinned,
    togglePin,
    movePinned,
  };
}
