import type { BinState, NormalizedStorageType, StorageType } from "../types/warehouse";
import { STORAGE_TYPE_COLORS, colorsForNormalizedType } from "./storageTypeColors";
import {
  formatWarehouseLocationTypeLabel,
  isKnownWarehouseLocationTypeToken,
} from "./warehouseLocationTypeLabels";

export const STORAGE_TYPE_OPTIONS: Array<{ value: StorageType; label: string }> = [
  { value: "primary", label: formatWarehouseLocationTypeLabel("primary") },
  { value: "pick", label: formatWarehouseLocationTypeLabel("pick") },
  { value: "buffer", label: formatWarehouseLocationTypeLabel("buffer") },
  { value: "reserve", label: formatWarehouseLocationTypeLabel("reserve") },
  { value: "damaged", label: formatWarehouseLocationTypeLabel("damaged") },
];

export const TEMPLATE_STORAGE_TYPE_OPTIONS: Array<{ value: StorageType; label: string }> = [
  { value: "primary", label: formatWarehouseLocationTypeLabel("primary") },
  { value: "reserve", label: formatWarehouseLocationTypeLabel("reserve") },
  { value: "damaged", label: formatWarehouseLocationTypeLabel("damaged") },
];

export const STORAGE_TYPE_STYLES: Record<StorageType, { bg: string; border: string; text: string }> = STORAGE_TYPE_COLORS;

/**
 * Map API/layout/DB strings to a canonical type or `unknown`.
 * - Missing / empty / unrecognized → `unknown` (never default to primary).
 * - Legacy `store` → `pick`.
 */
export function normalizeStorageType(value: unknown): NormalizedStorageType {
  if (value == null) return "unknown";
  const lower = String(value).trim().toLowerCase();
  if (!lower) return "unknown";
  if (lower === "reserve" || lower === "reserved" || lower === "reservation" || lower === "zapasowa") return "reserve";
  if (lower === "store" || lower === "shop" || lower === "sklep" || lower === "sklepowa") return "pick";
  if (lower === "primary" || lower === "podstawowa") return "primary";
  if (lower === "pick") return "pick";
  if (lower === "buffer" || lower === "buforowa") return "buffer";
  if (lower === "damaged") return "damaged";
  return "unknown";
}

export function isReserveStorageType(value: unknown): boolean {
  return normalizeStorageType(value) === "reserve";
}

export function getStorageTypeStyle(value: unknown): { bg: string; border: string; text: string } {
  return colorsForNormalizedType(normalizeStorageType(value));
}

/** Alias: warehouse map / WMS badges share {@link getStorageTypeStyle} (background, border, icon color). */
export const getLocationTypeStyle = getStorageTypeStyle;

export function getStorageTypeLabel(value: unknown): string {
  if (value == null) return "Nieznany";
  const raw = String(value).trim();
  if (!raw) return "Nieznany";

  const fromRaw = formatWarehouseLocationTypeLabel(raw);
  if (fromRaw !== raw || isKnownWarehouseLocationTypeToken(raw)) return fromRaw;

  const normalized = normalizeStorageType(value);
  if (normalized === "unknown") return "Nieznany";
  return formatWarehouseLocationTypeLabel(normalized);
}

export function legacyReserveKeysToBinTypeMap(keys?: string[] | null): Record<string, StorageType> {
  const out: Record<string, StorageType> = {};
  for (const key of keys ?? []) {
    if (typeof key !== "string") continue;
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    out[normalizedKey] = "reserve";
  }
  return out;
}

export function normalizeBinTypeMap(
  map?: Record<string, unknown> | null,
  legacyReserveKeys?: string[] | null,
): Record<string, NormalizedStorageType> {
  const source = map && typeof map === "object" ? map : legacyReserveKeysToBinTypeMap(legacyReserveKeys);
  const out: Record<string, NormalizedStorageType> = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    out[normalizedKey] = normalizeStorageType(value);
  }
  return out;
}

export function buildBinTypeMapFromBins(
  bins?: Array<Pick<BinState, "level_index" | "segment_index" | "storage_type">>,
): Record<string, NormalizedStorageType> {
  const out: Record<string, NormalizedStorageType> = {};
  for (const bin of bins ?? []) {
    out[`${bin.level_index}-${bin.segment_index}`] = normalizeStorageType(bin.storage_type);
  }
  return out;
}
