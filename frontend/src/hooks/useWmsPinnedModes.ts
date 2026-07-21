import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { putWmsTopbarPins } from "../api/authApi";
import { useAuth } from "../context/AuthContext";
import { useWarehouse } from "../context/WarehouseContext";
import { WMS_TAB_ITEMS, type WmsTabConfigItem } from "../pages/wms/wmsTabConfig";
import { resolveWmsNavTabs } from "../pages/wms/wmsNavTabs";
import {
  defaultWmsPinnedModes,
  normalizeWmsPinnedModes,
  readWmsPinnedModesFromStorage,
  writeWmsPinnedModesToStorage,
  type WmsPinnedMode,
} from "../pages/wms/wmsPinnedModesStorage";

export type { WmsPinnedMode };

function modesFromServerOrLocal(
  userId: number | null,
  serverPins: WmsPinnedMode[] | null | undefined,
): WmsPinnedMode[] {
  const keys = WMS_TAB_ITEMS.map((t) => t.id);
  if (serverPins != null) {
    return normalizeWmsPinnedModes(serverPins, keys);
  }
  return readWmsPinnedModesFromStorage(userId);
}

export function useWmsPinnedModes(userId: number | null) {
  const { user } = useAuth();
  const { activeWarehouseRequiresPutaway } = useWarehouse();
  const serverPins = user?.wms_topbar_pins ?? user?.wms_profile?.wms_topbar_pins ?? null;
  const serverPinsKey = serverPins == null ? "null" : JSON.stringify(serverPins);
  const operationalModes =
    user?.wms_operational_modes ?? user?.wms_profile?.wms_operational_modes ?? [];

  const [modes, setModes] = useState<WmsPinnedMode[]>(() =>
    modesFromServerOrLocal(userId, serverPins as WmsPinnedMode[] | null),
  );
  const saveTimer = useRef<number | null>(null);
  const skipNextPersist = useRef(false);

  useEffect(() => {
    skipNextPersist.current = true;
    const parsed =
      serverPinsKey === "null" ? null : (JSON.parse(serverPinsKey) as WmsPinnedMode[]);
    setModes(modesFromServerOrLocal(userId, parsed));
  }, [userId, serverPinsKey]);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    writeWmsPinnedModesToStorage(userId, modes);
    if (userId == null) return;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void putWmsTopbarPins(modes).catch(() => {
        /* local cache already written; next login may re-sync from server */
      });
    }, 400);
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, [userId, modes]);

  const navResolution = useMemo(
    () => resolveWmsNavTabs(modes, operationalModes, activeWarehouseRequiresPutaway),
    [modes, operationalModes, activeWarehouseRequiresPutaway],
  );

  const pinnedTabsInOrder: WmsTabConfigItem[] = navResolution.pinnedTabs;
  const visibleNavTabs: WmsTabConfigItem[] = navResolution.finalTabs;
  const dashboardTiles: WmsTabConfigItem[] = navResolution.dashboardTiles;

  const isPinned = useCallback(
    (key: string) => modes.some((m) => m.key === key && m.pinned),
    [modes],
  );

  const togglePin = useCallback((key: string) => {
    setModes((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx === -1) {
        const keys = WMS_TAB_ITEMS.map((t) => t.id);
        const base = normalizeWmsPinnedModes(prev.length ? prev : defaultWmsPinnedModes(), keys);
        const i = base.findIndex((x) => x.key === key);
        if (i === -1) return prev;
        const next = [...base];
        const maxOrder = Math.max(-1, ...next.filter((m) => m.pinned).map((m) => m.order));
        next[i] = { ...next[i], pinned: true, order: maxOrder + 1 };
        return next;
      }
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

  const reorderPinned = useCallback((activeKey: string, overKey: string) => {
    if (activeKey === overKey) return;
    setModes((prev) => {
      const pinned = prev.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
      const oldIndex = pinned.findIndex((m) => m.key === activeKey);
      const newIndex = pinned.findIndex((m) => m.key === overKey);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const reordered = [...pinned];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      const orderByKey = new Map(reordered.map((m, i) => [m.key, i]));
      return prev.map((m) => (m.pinned ? { ...m, order: orderByKey.get(m.key) ?? m.order } : m));
    });
  }, []);

  return {
    modes,
    pinnedTabsInOrder,
    visibleNavTabs,
    dashboardTiles,
    navResolution,
    isPinned,
    togglePin,
    movePinned,
    reorderPinned,
    catalogTabs: WMS_TAB_ITEMS,
    pinnableModules: navResolution.pinnableModules,
  };
}
