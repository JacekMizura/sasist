import {
  DEFAULT_DIRECT_SALES_SETTINGS,
  normalizeDirectSalesSettings,
  type DirectSalesSettingsConfig,
  type DirectSalesSettingsRead,
} from "../../wmsSettings/directSales/schemas/directSalesSettingsSchema";

const CACHE_PREFIX = "direct_sales_settings_v1";

export type CachedDirectSalesSettings = {
  tenantId: number;
  warehouseId: number;
  settingsVersion: string;
  updatedAt: string | null;
  resolved: DirectSalesSettingsConfig;
  cachedAt: string;
};

function cacheKey(tenantId: number, warehouseId: number): string {
  return `${CACHE_PREFIX}:${tenantId}:${warehouseId}`;
}

export function readCachedDirectSalesSettings(
  tenantId: number,
  warehouseId: number,
): CachedDirectSalesSettings | null {
  try {
    const raw = localStorage.getItem(cacheKey(tenantId, warehouseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDirectSalesSettings;
    if (
      parsed?.tenantId !== tenantId ||
      parsed?.warehouseId !== warehouseId ||
      !parsed?.resolved ||
      typeof parsed.settingsVersion !== "string"
    ) {
      return null;
    }
    return {
      ...parsed,
      resolved: normalizeDirectSalesSettings(parsed.resolved),
    };
  } catch {
    return null;
  }
}

export function writeCachedDirectSalesSettings(read: DirectSalesSettingsRead): void {
  const version = read.settings_version ?? "";
  if (!version) return;
  const entry: CachedDirectSalesSettings = {
    tenantId: read.tenant_id,
    warehouseId: read.warehouse_id,
    settingsVersion: version,
    updatedAt: read.updated_at ?? null,
    resolved: normalizeDirectSalesSettings(read.resolved),
    cachedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(cacheKey(read.tenant_id, read.warehouse_id), JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}

export function cachedOrDefaultSettings(
  tenantId: number,
  warehouseId: number,
): DirectSalesSettingsConfig {
  return readCachedDirectSalesSettings(tenantId, warehouseId)?.resolved ?? DEFAULT_DIRECT_SALES_SETTINGS;
}

export function shouldRefreshCachedSettings(
  cached: CachedDirectSalesSettings | null,
  api: DirectSalesSettingsRead,
): boolean {
  if (!cached) return true;
  const apiVersion = api.settings_version ?? "";
  return !apiVersion || apiVersion !== cached.settingsVersion;
}
