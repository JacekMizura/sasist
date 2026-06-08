const RECENT_KEY = "wms-inventory-recent-location-sessions";
const SESSION_KEY = "wms-inventory-location-session-products";
const LEGACY_KEY = "wms-inventory-recent-locations";
const MAX_RECENT = 5;

export type SessionProductAggregate = {
  product_id: number;
  product_name: string | null;
  sku?: string | null;
  counted_quantity: number;
  updatedAt: string;
};

/** Aggregated recent location row for entry screen — one summary per location visit. */
export type RecentLocationSession = {
  taskId: number;
  locationId: number;
  code: string;
  at: string;
  lastProductId: number | null;
  lastProductName: string | null;
  lastProductQty: number;
};

/** @deprecated Use RecentLocationSession */
export type RecentLocationEntry = {
  code: string;
  taskId: number;
  at: string;
};

type LocationSessionBucket = {
  locationId: number;
  locationCode: string;
  products: Record<string, SessionProductAggregate>;
  updatedAt: string;
};

function readRecent(): RecentLocationSession[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return migrateLegacyRecent();
    const parsed = JSON.parse(raw) as RecentLocationSession[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(rows: RecentLocationSession[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(rows.slice(0, MAX_RECENT)));
}

function migrateLegacyRecent(): RecentLocationSession[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentLocationEntry[];
    if (!Array.isArray(parsed)) return [];
    const migrated: RecentLocationSession[] = parsed.map((row) => ({
      taskId: row.taskId,
      locationId: 0,
      code: row.code,
      at: row.at,
      lastProductId: null,
      lastProductName: null,
      lastProductQty: 0,
    }));
    if (migrated.length) writeRecent(migrated);
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return [];
  }
}

function readSessionStore(): Record<string, LocationSessionBucket> {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocationSessionBucket>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessionStore(store: Record<string, LocationSessionBucket>) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(store));
}

function latestProduct(bucket: LocationSessionBucket): SessionProductAggregate | null {
  let best: SessionProductAggregate | null = null;
  for (const p of Object.values(bucket.products)) {
    if (!best || p.updatedAt > best.updatedAt) best = p;
  }
  return best;
}

function sessionToRecentEntry(taskId: number, bucket: LocationSessionBucket): RecentLocationSession {
  const last = latestProduct(bucket);
  return {
    taskId,
    locationId: bucket.locationId,
    code: bucket.locationCode,
    at: bucket.updatedAt,
    lastProductId: last?.product_id ?? null,
    lastProductName: last?.product_name ?? last?.sku ?? null,
    lastProductQty: last?.counted_quantity ?? 0,
  };
}

function upsertRecentPreview(entry: RecentLocationSession) {
  const prev = readRecent().filter((x) => x.taskId !== entry.taskId);
  writeRecent([entry, ...prev]);
}

/** Load 3–5 recent locations with aggregated last-product context. */
export function loadRecentLocationSessions(): RecentLocationSession[] {
  return readRecent();
}

/** @deprecated */
export function loadRecentLocations(): RecentLocationEntry[] {
  return loadRecentLocationSessions().map(({ code, taskId, at }) => ({ code, taskId, at }));
}

/** Touch recent row when opening a location (before product counts exist). */
export function touchRecentLocation(entry: {
  code: string;
  taskId: number;
  locationId: number;
}) {
  const now = new Date().toISOString();
  const existing = readRecent().find((x) => x.taskId === entry.taskId);
  upsertRecentPreview({
    taskId: entry.taskId,
    locationId: entry.locationId,
    code: entry.code,
    at: now,
    lastProductId: existing?.lastProductId ?? null,
    lastProductName: existing?.lastProductName ?? null,
    lastProductQty: existing?.lastProductQty ?? 0,
  });
}

/** @deprecated */
export function pushRecentLocation(entry: Omit<RecentLocationEntry, "at">) {
  touchRecentLocation({ ...entry, locationId: 0 });
}

/** Upsert aggregated product qty for active location session (not per-scan events). */
export function syncLocationSessionProduct(args: {
  taskId: number;
  locationId: number;
  locationCode: string;
  productId: number;
  productName: string | null;
  sku?: string | null;
  countedQuantity: number;
}) {
  const now = new Date().toISOString();
  const store = readSessionStore();
  const key = String(args.taskId);
  const bucket: LocationSessionBucket = store[key] ?? {
    locationId: args.locationId,
    locationCode: args.locationCode,
    products: {},
    updatedAt: now,
  };

  bucket.locationId = args.locationId;
  bucket.locationCode = args.locationCode;
  bucket.updatedAt = now;
  bucket.products[String(args.productId)] = {
    product_id: args.productId,
    product_name: args.productName,
    sku: args.sku,
    counted_quantity: args.countedQuantity,
    updatedAt: now,
  };
  store[key] = bucket;
  writeSessionStore(store);
  upsertRecentPreview(sessionToRecentEntry(args.taskId, bucket));
}

/** Persist location session summary when operator finishes location. */
export function commitLocationSessionToRecent(taskId: number) {
  const store = readSessionStore();
  const bucket = store[String(taskId)];
  if (!bucket) return;
  upsertRecentPreview(sessionToRecentEntry(taskId, bucket));
  delete store[String(taskId)];
  writeSessionStore(store);
}

export function formatRelativeTimePl(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const diffMs = Date.now() - ts;
  if (diffMs < 45_000) return "przed chwilą";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.floor(hours / 24);
  return `${days} d. temu`;
}
