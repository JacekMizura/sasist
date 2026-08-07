import type { WmsSettingsTabId } from "../WmsSettingsChrome";

/**
 * Declarative registry entry for global WMS settings search.
 * DOM targeting uses `data-wms-setting-id={id}` (see {@link WmsSettingField}).
 */
export type WmsSettingsSearchEntry = {
  id: string;
  label: string;
  description?: string;
  tabId: WmsSettingsTabId;
  tabLabel: string;
  sectionId: string;
  sectionLabel: string;
  /** Subsection / card group, e.g. „A. Ogólny układ”. */
  groupLabel?: string;
  keywords?: string[];
};

export type WmsSettingsSearchHit = WmsSettingsSearchEntry & {
  score: number;
};
