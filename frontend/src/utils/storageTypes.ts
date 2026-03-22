import type { BinState, StorageType } from "../types/warehouse";
import { STORAGE_TYPE_COLORS, STORAGE_TYPE_NEUTRAL_COLORS } from "./storageTypeColors";

export const STORAGE_TYPE_OPTIONS: Array<{ value: StorageType; label: string }> = [
  { value: "primary", label: "Podstawowa" },
  { value: "reserve", label: "Zapasowa" },
  { value: "store", label: "Sklepowa" },
  { value: "buffer", label: "Buforowa" },
  { value: "damaged", label: "Uszkodzone" },
];

export const TEMPLATE_STORAGE_TYPE_OPTIONS: Array<{ value: StorageType; label: string }> = [
  { value: "primary", label: "Podstawowa" },
  { value: "reserve", label: "Zapasowa" },
  { value: "damaged", label: "Uszkodzone" },
];

export const STORAGE_TYPE_STYLES: Record<StorageType, { bg: string; border: string; text: string }> = STORAGE_TYPE_COLORS;

export function normalizeStorageType(value: unknown): StorageType {
  if (value == null) return "primary";
  const lower = String(value).trim().toLowerCase();
  if (lower === "reserve" || lower === "reserved" || lower === "reservation") return "reserve";
  if (lower === "primary" || lower === "store" || lower === "buffer" || lower === "damaged") {
    return lower;
  }
  return "primary";
}

export function isReserveStorageType(value: unknown): boolean {
  return normalizeStorageType(value) === "reserve";
}

export function getStorageTypeStyle(value: unknown): { bg: string; border: string; text: string } {
  const normalized = normalizeStorageType(value);
  return STORAGE_TYPE_STYLES[normalized] ?? STORAGE_TYPE_NEUTRAL_COLORS;
}

export function getStorageTypeLabel(value: unknown): string {
  const normalized = normalizeStorageType(value);
  return STORAGE_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ?? "Podstawowa";
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
): Record<string, StorageType> {
  const source = map && typeof map === "object" ? map : legacyReserveKeysToBinTypeMap(legacyReserveKeys);
  const out: Record<string, StorageType> = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    out[normalizedKey] = normalizeStorageType(value);
  }
  return out;
}

export function buildBinTypeMapFromBins(bins?: Array<Pick<BinState, "level_index" | "segment_index" | "storage_type">>): Record<string, StorageType> {
  const out: Record<string, StorageType> = {};
  for (const bin of bins ?? []) {
    out[`${bin.level_index}-${bin.segment_index}`] = normalizeStorageType(bin.storage_type);
  }
  return out;
}
