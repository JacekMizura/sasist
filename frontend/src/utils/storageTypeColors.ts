import type { StorageType } from "../types/warehouse";

export const STORAGE_TYPE_COLORS: Record<StorageType, { bg: string; border: string; text: string }> = {
  primary: {
    bg: "#dbeafe",
    border: "#3b82f6",
    text: "#1d4ed8",
  },
  reserve: {
    bg: "#fef9c3",
    border: "#facc15",
    text: "#a16207",
  },
  store: {
    bg: "#dcfce7",
    border: "#22c55e",
    text: "#166534",
  },
  buffer: {
    bg: "#f3e8ff",
    border: "#a855f7",
    text: "#6b21a8",
  },
  damaged: {
    bg: "#fee2e2",
    border: "#ef4444",
    text: "#991b1b",
  },
};

export const STORAGE_TYPE_NEUTRAL_COLORS = {
  bg: "#f8fafc",
  border: "#cbd5e1",
  text: "#475569",
};
