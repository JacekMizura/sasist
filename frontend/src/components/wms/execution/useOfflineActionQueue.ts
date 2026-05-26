import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "wms.offlineActionQueue";

export type OfflineQueuedAction = {
  id: string;
  label: string;
  createdAt: string;
  retryCount: number;
  run: () => Promise<void>;
};

type PersistedRow = {
  id: string;
  label: string;
  createdAt: string;
  retryCount: number;
};

function loadPersisted(): PersistedRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x === "object") as PersistedRow[];
  } catch {
    return [];
  }
}

function savePersisted(rows: PersistedRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 30)));
  } catch {
    /* ignore */
  }
}

/**
 * Frontend-only queue for retry when network returns (handlers registered per action id).
 */
export function useOfflineActionQueue() {
  const [pendingLabels, setPendingLabels] = useState<PersistedRow[]>(() => loadPersisted());
  const runnersRef = useRef(new Map<string, () => Promise<void>>());

  useEffect(() => {
    savePersisted(pendingLabels);
  }, [pendingLabels]);

  const enqueue = useCallback(
    (action: Omit<OfflineQueuedAction, "retryCount"> & { retryCount?: number }) => {
      runnersRef.current.set(action.id, action.run);
      setPendingLabels((prev) => {
        const next = prev.filter((p) => p.id !== action.id);
        next.push({
          id: action.id,
          label: action.label,
          createdAt: action.createdAt,
          retryCount: action.retryCount ?? 0,
        });
        return next;
      });
    },
    [runnersRef],
  );

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const snapshot = [...pendingLabels];
    for (const row of snapshot) {
      const run = runnersRef.current.get(row.id);
      if (!run) continue;
      try {
        await run();
        runnersRef.current.delete(row.id);
        setPendingLabels((prev) => prev.filter((p) => p.id !== row.id));
      } catch {
        setPendingLabels((prev) =>
          prev.map((p) => (p.id === row.id ? { ...p, retryCount: p.retryCount + 1 } : p)),
        );
      }
    }
  }, [pendingLabels, runnersRef]);

  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  return {
    pendingCount: pendingLabels.length,
    pendingLabels,
    enqueue,
    flush,
  };
}
