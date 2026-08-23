import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { useAuth } from "../context/AuthContext";
import { useWarehouse } from "../context/WarehouseContext";
import { WMS_TAB_ITEMS, type WmsTabConfigItem } from "../pages/wms/wmsTabConfig";
import { resolveWmsNavTabs } from "../pages/wms/wmsNavTabs";
import {
  applyMovePinned,
  applyReorderPinned,
  applyTogglePin,
} from "../pages/wms/wmsPinnedModesMutations";
import {
  applyWmsPinnedModesUserMutation,
  configureWmsPinnedModesPersist,
  getWmsPinnedModesHydratedKey,
  getWmsPinnedModesSnapshot,
  setWmsPinnedModesSnapshot,
  subscribeWmsPinnedModes,
} from "../pages/wms/wmsPinnedModesStore";
import {
  normalizeWmsPinnedModes,
  readWmsPinnedModesFromStorage,
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

function hydrateKeyFor(userId: number | null, serverPinsKey: string): string {
  return `${userId ?? "anon"}|${serverPinsKey}`;
}

/**
 * Shared pin preferences for dashboard config + topbar.
 * All call sites subscribe to one in-memory snapshot (server field remains DB SSOT).
 */
export function useWmsPinnedModes(userId: number | null) {
  const { user, patchWmsTopbarPins } = useAuth();
  const { activeWarehouseRequiresPutaway } = useWarehouse();
  const serverPins = user?.wms_topbar_pins ?? user?.wms_profile?.wms_topbar_pins ?? null;
  const serverPinsKey = serverPins == null ? "null" : JSON.stringify(serverPins);
  const operationalModes =
    user?.wms_operational_modes ?? user?.wms_profile?.wms_operational_modes ?? [];
  const permissionKeys = user?.permissions ?? [];

  useEffect(() => {
    configureWmsPinnedModesPersist({ patchAuthPins: patchWmsTopbarPins });
  }, [patchWmsTopbarPins]);

  const modes = useSyncExternalStore(
    subscribeWmsPinnedModes,
    getWmsPinnedModesSnapshot,
    getWmsPinnedModesSnapshot,
  );

  // Hydrate from Auth /me pins (or localStorage when server has no row yet).
  useEffect(() => {
    const key = hydrateKeyFor(userId, serverPinsKey);
    if (getWmsPinnedModesHydratedKey() === key && getWmsPinnedModesSnapshot().length > 0) {
      return;
    }
    const parsed =
      serverPinsKey === "null" ? null : (JSON.parse(serverPinsKey) as WmsPinnedMode[]);
    setWmsPinnedModesSnapshot(modesFromServerOrLocal(userId, parsed), {
      hydrateKey: key,
      skipPersist: true,
    });
  }, [userId, serverPinsKey]);

  const navResolution = useMemo(
    () => resolveWmsNavTabs(modes, operationalModes, activeWarehouseRequiresPutaway, permissionKeys),
    [modes, operationalModes, activeWarehouseRequiresPutaway, permissionKeys],
  );

  const pinnedTabsInOrder: WmsTabConfigItem[] = navResolution.pinnedTabs;
  const visibleNavTabs: WmsTabConfigItem[] = navResolution.finalTabs;
  const dashboardTiles: WmsTabConfigItem[] = navResolution.dashboardTiles;

  const isPinned = useCallback(
    (key: string) => modes.some((m) => m.key === key && m.pinned),
    [modes],
  );

  const pinOrder = useCallback(
    (key: string) => modes.find((m) => m.key === key)?.order ?? 0,
    [modes],
  );

  const togglePin = useCallback((key: string) => {
    applyWmsPinnedModesUserMutation(applyTogglePin(getWmsPinnedModesSnapshot(), key));
  }, []);

  const movePinned = useCallback((key: string, delta: -1 | 1) => {
    applyWmsPinnedModesUserMutation(applyMovePinned(getWmsPinnedModesSnapshot(), key, delta));
  }, []);

  const reorderPinned = useCallback((activeKey: string, overKey: string) => {
    applyWmsPinnedModesUserMutation(applyReorderPinned(getWmsPinnedModesSnapshot(), activeKey, overKey));
  }, []);

  return {
    modes,
    pinnedTabsInOrder,
    visibleNavTabs,
    dashboardTiles,
    navResolution,
    isPinned,
    pinOrder,
    togglePin,
    movePinned,
    reorderPinned,
    catalogTabs: WMS_TAB_ITEMS,
    pinnableModules: navResolution.pinnableModules,
  };
}
