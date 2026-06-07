import {
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

export function resolveWmsNavTabs(
  pinnedModes: WmsPinnedMode[],
  userOperationalModes?: string[] | null,
): WmsNavTabsResolution {
  const catalog = WMS_TAB_ITEMS;
  const catalogIds = catalog.map((t) => t.id);

  const allowedModeKeys =
    userOperationalModes && userOperationalModes.length > 0
      ? new Set(userOperationalModes.map((m) => String(m).trim()).filter(Boolean))
      : null;

  const allowedModules = WMS_MODULES.filter((m) => moduleAllowed(m, allowedModeKeys));
  const permissionFilteredCatalog = allowedModules.map(toTabItem);
  const permissionFilteredIds = permissionFilteredCatalog.map((t) => t.id);

  const dashboardModules = allowedModules
    .filter((m) => m.dashboard)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const dashboardTiles = dashboardModules.map(toTabItem);

  const pinned = pinnedModes.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
  const pinnedTabIds = pinned.map((m) => m.key) as WmsTabId[];
  const pinnedTabs = pinned
    .map((m) => permissionFilteredCatalog.find((t) => t.id === m.key))
    .filter((t): t is WmsTabConfigItem => Boolean(t));

  const baseTabs = pinnedTabs.length > 0 ? pinnedTabs : permissionFilteredCatalog;
  const finalTabs = baseTabs;

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
    baseTabs,
    finalTabs,
    finalTabIds: finalTabs.map((t) => t.id),
  };
}
