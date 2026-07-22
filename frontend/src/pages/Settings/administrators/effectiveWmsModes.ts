import { WMS_OPERATIONAL_MODE_KEYS } from "../../../constants/wmsOperationalModes";

/**
 * Effective WMS operational modes for list badges.
 * Empty stored list = all modes (same rule as WmsOperationalModeGate / resolveWmsNavTabs).
 */
export function effectiveWmsModeKeys(stored: string[] | null | undefined): string[] {
  const raw = (stored ?? []).map((m) => String(m).trim()).filter(Boolean);
  if (raw.length === 0) return [...WMS_OPERATIONAL_MODE_KEYS];
  const allowed = new Set(raw);
  return WMS_OPERATIONAL_MODE_KEYS.filter((k) => allowed.has(k));
}
