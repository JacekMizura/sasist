import {
  WMS_MODULES,
  WMS_TAB_ITEMS,
  type WmsModuleDefinition,
  type WmsTabConfigItem,
  type WmsTabId,
} from "./wmsTabConfig";
import type { WmsPinnedMode } from "./wmsPinnedModesStorage";

/** Always visible — major WMS module; never gated by ``wms_operational_modes``. */
export const MANDATORY_WMS_TAB_IDS: WmsTabId[] = ["production"];

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

function ensureMandatoryTabs(tabs: WmsTabConfigItem[]): WmsTabConfigItem[] {
  const seen = new Set(tabs.map((t) => t.id));
  const mandatory = WMS_TAB_ITEMS.filter((t) => MANDATORY_WMS_TAB_IDS.includes(t.id) && !seen.has(t.id));
  if (mandatory.length === 0) return tabs;
  return [...mandatory, ...tabs];
}

function sortTabsLikeRegistry(tabs: WmsTabConfigItem[]): WmsTabConfigItem[] {
  const order = new Map(WMS_TAB_ITEMS.map((t, i) => [t.id, i]));
  return [...tabs].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
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
  let permissionFilteredCatalog = sortTabsLikeRegistry(allowedModules.map(toTabItem));
  permissionFilteredCatalog = ensureMandatoryTabs(permissionFilteredCatalog);
  const permissionFilteredIds = permissionFilteredCatalog.map((t) => t.id);

  let dashboardModules = allowedModules.filter((m) => m.dashboard).sort((a, b) => a.sortOrder - b.sortOrder);
  const mandatoryModules = WMS_MODULES.filter((m) => MANDATORY_WMS_TAB_IDS.includes(m.id));
  for (const mod of mandatoryModules) {
    if (!dashboardModules.some((m) => m.id === mod.id)) {
      dashboardModules = [...dashboardModules, mod];
    }
  }
  dashboardModules.sort((a, b) => a.sortOrder - b.sortOrder);
  const dashboardTiles = ensureMandatoryTabs(dashboardModules.map(toTabItem));

  const pinned = pinnedModes.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
  const pinnedTabIds = pinned.map((m) => m.key) as WmsTabId[];
  const pinnedTabs = pinned
    .map((m) => permissionFilteredCatalog.find((t) => t.id === m.key))
    .filter((t): t is WmsTabConfigItem => Boolean(t));

  const baseTabs = pinnedTabs.length > 0 ? pinnedTabs : permissionFilteredCatalog;
  const finalTabs = ensureMandatoryTabs(baseTabs);

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
