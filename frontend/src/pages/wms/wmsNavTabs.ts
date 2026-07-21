import {
  DEFAULT_WMS_TOPBAR_PIN_IDS,
  WMS_MODULES,
  WMS_TAB_ITEMS,
  type WmsModuleDefinition,
  type WmsTabConfigItem,
  type WmsTabId,
} from "./wmsTabConfig";
import type { WmsPinnedMode } from "./wmsPinnedModesStorage";

export type WmsNavTabsResolution = {
  catalog: WmsTabConfigItem[];
  catalogIds: WmsTabId[];
  dashboardModules: WmsModuleDefinition[];
  dashboardTiles: WmsTabConfigItem[];
  pinnedModes: WmsPinnedMode[];
  pinnedTabIds: WmsTabId[];
  pinnedTabs: WmsTabConfigItem[];
  permissionFilteredCatalog: WmsTabConfigItem[];
  permissionFilteredIds: WmsTabId[];
  pinnableModules: WmsModuleDefinition[];
  baseTabs: WmsTabConfigItem[];
  finalTabs: WmsTabConfigItem[];
  finalTabIds: WmsTabId[];
};

function moduleAllowed(
  module: WmsModuleDefinition,
  allowedModeKeys: Set<string> | null,
): boolean {
  if (!allowedModeKeys || allowedModeKeys.size === 0) return true;
  if (!module.operationalMode) return true;
  return allowedModeKeys.has(module.operationalMode);
}

function toTabItem(module: WmsModuleDefinition): WmsTabConfigItem {
  return { id: module.id, path: module.path, label: module.label, icon: module.icon };
}

function sortTabsLikeRegistry(tabs: WmsTabConfigItem[]): WmsTabConfigItem[] {
  const order = new Map(WMS_TAB_ITEMS.map((t, i) => [t.id, i]));
  return [...tabs].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}

/**
 * Dashboard = all modules allowed by permissions.
 * Topbar = allowed ∩ pinned ∩ order (never bypass permission via pin).
 */
export function resolveWmsNavTabs(
  pinnedModes: WmsPinnedMode[],
  userOperationalModes?: string[] | null,
  activeWarehouseRequiresPutaway = true,
): WmsNavTabsResolution {
  const catalog = WMS_TAB_ITEMS;
  const catalogIds = catalog.map((t) => t.id);

  const allowedModeKeys =
    userOperationalModes && userOperationalModes.length > 0
      ? new Set(userOperationalModes.map((m) => String(m).trim()).filter(Boolean))
      : null;

  let allowedModules = WMS_MODULES.filter((m) => moduleAllowed(m, allowedModeKeys));
  if (!activeWarehouseRequiresPutaway) {
    allowedModules = allowedModules.filter((m) => m.id !== "putaway");
  }

  const permissionFilteredCatalog = sortTabsLikeRegistry(allowedModules.map(toTabItem));
  const permissionFilteredIds = permissionFilteredCatalog.map((t) => t.id);

  const dashboardModules = allowedModules
    .filter((m) => m.dashboard)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const dashboardTiles = dashboardModules.map(toTabItem);

  const pinnableModules = allowedModules.filter((m) => m.canPin && m.dashboard);

  const pinned = pinnedModes.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
  const pinnedTabIds = pinned.map((m) => m.key) as WmsTabId[];
  const pinnedTabs = pinned
    .map((m) => permissionFilteredCatalog.find((t) => t.id === m.key))
    .filter((t): t is WmsTabConfigItem => Boolean(t))
    .filter((t) => {
      const mod = WMS_MODULES.find((x) => x.id === t.id);
      return Boolean(mod?.canPin);
    });

  /** Topbar shows only user-pinned modules (configure on /wms/menu). */
  const finalTabs = pinnedTabs;

  return {
    catalog,
    catalogIds,
    dashboardModules,
    dashboardTiles,
    pinnedModes,
    pinnedTabIds,
    pinnedTabs,
    permissionFilteredCatalog,
    permissionFilteredIds,
    pinnableModules,
    baseTabs: pinnedTabs,
    finalTabs,
    finalTabIds: finalTabs.map((t) => t.id),
  };
}

export { DEFAULT_WMS_TOPBAR_PIN_IDS };
