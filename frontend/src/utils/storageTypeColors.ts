import type { NormalizedStorageType, StorageType } from "../types/warehouse";

/** Fixed mapping: PRIMARY blue, PICK green, BUFFER purple, RESERVE yellow, DAMAGED red. */
export const STORAGE_TYPE_COLORS: Record<StorageType, { bg: string; border: string; text: string }> = {
  primary: {
    bg: "#dbeafe",
    border: "#3b82f6",
    text: "#1d4ed8",
  },
  pick: {
    bg: "#dcfce7",
    border: "#22c55e",
    text: "#166534",
  },
  buffer: {
    bg: "#f3e8ff",
    border: "#a855f7",
    text: "#6b21a8",
  },
  reserve: {
    bg: "#fef9c3",
    border: "#facc15",
    text: "#a16207",
  },
  damaged: {
    bg: "#fee2e2",
    border: "#ef4444",
    text: "#991b1b",
  },
};

/** Missing / invalid type — neutral gray (not primary blue). */
export const STORAGE_TYPE_NEUTRAL_COLORS = {
  bg: "#f1f5f9",
  border: "#94a3b8",
  text: "#475569",
};

export const STORAGE_TYPE_UNKNOWN_COLORS = STORAGE_TYPE_NEUTRAL_COLORS;

export function colorsForNormalizedType(st: NormalizedStorageType): { bg: string; border: string; text: string } {
  if (st === "unknown") return STORAGE_TYPE_UNKNOWN_COLORS;
  return STORAGE_TYPE_COLORS[st];
}
