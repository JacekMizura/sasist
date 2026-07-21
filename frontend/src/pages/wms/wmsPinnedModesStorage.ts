import { DEFAULT_WMS_TOPBAR_PIN_IDS, WMS_TAB_ITEMS, type WmsTabId } from "./wmsTabConfig";

export type WmsPinnedMode = {
  key: string;
  pinned: boolean;
  order: number;
};

const STORAGE_VERSION = "v3";
const STORAGE_PREFIX = "wmsPinnedModes";

export function wmsPinnedModesStorageKey(userId: number | null): string {
  const id = userId != null && Number.isFinite(userId) ? String(userId) : "anon";
  return `${STORAGE_PREFIX}:${STORAGE_VERSION}:user:${id}`;
}

/** Legacy v2 key — used to migrate empty-all-unpinned → defaults once. */
function legacyV2StorageKey(userId: number | null): string {
  const id = userId != null && Number.isFinite(userId) ? String(userId) : "anon";
  return `${STORAGE_PREFIX}:v2:user:${id}`;
}

function defaultModes(catalogKeys: readonly string[]): WmsPinnedMode[] {
  return catalogKeys.map((key) => {
    const pinIdx = DEFAULT_WMS_TOPBAR_PIN_IDS.indexOf(key as WmsTabId);
    return {
      key,
      pinned: pinIdx >= 0,
      order: pinIdx >= 0 ? pinIdx : 0,
    };
  });
}

function compactPinnedOrders(modes: WmsPinnedMode[]): WmsPinnedMode[] {
  const pinned = modes.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
  const orderByKey = new Map<string, number>();
  pinned.forEach((m, i) => orderByKey.set(m.key, i));
  return modes.map((m) => (m.pinned ? { ...m, order: orderByKey.get(m.key) ?? m.order } : { ...m, order: 0 }));
}

export function normalizeWmsPinnedModes(stored: unknown, catalogKeys: readonly string[]): WmsPinnedMode[] {
  const catalogSet = new Set(catalogKeys);
  const base = defaultModes(catalogKeys);
  if (!Array.isArray(stored)) return base;

  const fromStore = new Map<string, WmsPinnedMode>();
  for (const row of stored) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const key = r.key;
    if (typeof key !== "string" || !catalogSet.has(key)) continue;
    fromStore.set(key, {
      key,
      pinned: Boolean(r.pinned),
      order: typeof r.order === "number" && Number.isFinite(r.order) ? r.order : 0,
    });
  }

  if (fromStore.size === 0) return base;

  const merged = base.map((d) => fromStore.get(d.key) ?? d);
  return compactPinnedOrders(merged);
}

export function readWmsPinnedModesFromStorage(userId: number | null): WmsPinnedMode[] {
  const keys = WMS_TAB_ITEMS.map((t) => t.id);
  if (typeof window === "undefined") return defaultModes(keys);
  try {
    const raw = localStorage.getItem(wmsPinnedModesStorageKey(userId));
    if (raw) {
      return normalizeWmsPinnedModes(JSON.parse(raw) as unknown, keys);
    }
    // Migrate v2: if user had explicit pins keep them; all-unpinned → defaults.
    const legacyRaw = localStorage.getItem(legacyV2StorageKey(userId));
    if (legacyRaw) {
      const legacy = normalizeWmsPinnedModes(JSON.parse(legacyRaw) as unknown, keys);
      const hadPins = legacy.some((m) => m.pinned);
      const migrated = hadPins ? legacy : defaultModes(keys);
      writeWmsPinnedModesToStorage(userId, migrated);
      return migrated;
    }
    return defaultModes(keys);
  } catch {
    return defaultModes(keys);
  }
}

export function writeWmsPinnedModesToStorage(userId: number | null, modes: WmsPinnedMode[]): void {
  if (typeof window === "undefined") return;
  try {
    const keys = WMS_TAB_ITEMS.map((t) => t.id);
    const normalized = normalizeWmsPinnedModes(modes, keys);
    localStorage.setItem(wmsPinnedModesStorageKey(userId), JSON.stringify(normalized));
  } catch {
    /* ignore quota / private mode */
  }
}

export function defaultWmsPinnedModes(): WmsPinnedMode[] {
  return defaultModes(WMS_TAB_ITEMS.map((t) => t.id));
}
