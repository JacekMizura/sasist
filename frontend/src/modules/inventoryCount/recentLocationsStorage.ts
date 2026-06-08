const STORAGE_KEY = "wms-inventory-recent-locations";
const MAX_RECENT = 4;

export type RecentLocationEntry = {
  code: string;
  taskId: number;
  at: string;
};

export function loadRecentLocations(): RecentLocationEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentLocationEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function pushRecentLocation(entry: Omit<RecentLocationEntry, "at">) {
  const next: RecentLocationEntry = { ...entry, at: new Date().toISOString() };
  const prev = loadRecentLocations().filter((x) => x.taskId !== entry.taskId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...prev].slice(0, MAX_RECENT)));
}
