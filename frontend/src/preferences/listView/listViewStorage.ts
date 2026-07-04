import type { ListViewScreenBundle, ListViewStatePayload } from "./listViewStateTypes";
import { buildListViewCacheMetaKey, buildListViewStorageKey } from "./listViewStorageKey";

type CacheMeta = {
  updatedAt: string | null;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function readListViewCache(
  tenantId: number,
  userId: number,
  screenId: string,
): { bundle: ListViewScreenBundle | null; autosave: ListViewStatePayload | null } {
  const key = buildListViewStorageKey(tenantId, userId, screenId);
  const cached = readJson<ListViewScreenBundle>(key);
  const autosave = cached?.autosave?.payload ?? readJson<ListViewStatePayload>(`${key}:autosave`);
  return { bundle: cached, autosave };
}

export function writeListViewCache(
  tenantId: number,
  userId: number,
  screenId: string,
  bundle: ListViewScreenBundle,
): void {
  const key = buildListViewStorageKey(tenantId, userId, screenId);
  writeJson(key, bundle);
  if (bundle.autosave?.payload) {
    writeJson(`${key}:autosave`, bundle.autosave.payload);
  }
  const meta: CacheMeta = {
    updatedAt: bundle.autosave?.updated_at ?? new Date().toISOString(),
  };
  writeJson(buildListViewCacheMetaKey(tenantId, userId, screenId), meta);
}

export function clearListViewCache(tenantId: number, userId: number, screenId: string): void {
  const key = buildListViewStorageKey(tenantId, userId, screenId);
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}:autosave`);
    localStorage.removeItem(buildListViewCacheMetaKey(tenantId, userId, screenId));
  } catch {
    /* ignore */
  }
}

export function readFiltersExpandedLegacy(key: string, fallback = false): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return fallback;
  } catch {
    return fallback;
  }
}
