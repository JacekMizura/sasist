import { WMS_TAB_ITEMS } from "./wmsTabConfig";

export type WmsPinnedMode = {
  key: string;
  pinned: boolean;
  order: number;
};

const STORAGE_VERSION = "v1";
const STORAGE_PREFIX = "wmsPinnedModes";

export function wmsPinnedModesStorageKey(userId: number | null): string {
  const id = userId != null && Number.isFinite(userId) ? String(userId) : "anon";
  return `${STORAGE_PREFIX}:${STORAGE_VERSION}:user:${id}`;
}

function defaultModes(catalogKeys: readonly string[]): WmsPinnedMode[] {
  return catalogKeys.map((key, i) => ({ key, pinned: false, order: i }));
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

  const merged = base.map((d) => fromStore.get(d.key) ?? d);
  return compactPinnedOrders(merged);
}

export function readWmsPinnedModesFromStorage(userId: number | null): WmsPinnedMode[] {
  const keys = WMS_TAB_ITEMS.map((t) => t.id);
  if (typeof window === "undefined") return defaultModes(keys);
  try {
    const raw = localStorage.getItem(wmsPinnedModesStorageKey(userId));
    if (!raw) return defaultModes(keys);
    const parsed = JSON.parse(raw) as unknown;
    return normalizeWmsPinnedModes(parsed, keys);
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
