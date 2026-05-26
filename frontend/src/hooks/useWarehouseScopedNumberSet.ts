import { useCallback, useEffect, useMemo, useState } from "react";

function parseStoredMap(raw: string | null): Record<string, number[]> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      const nums = v.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      if (nums.length) out[k] = nums;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Persystencja wybranych ID (np. statusów panelu) per magazyn w localStorage — bez nowego API.
 */
export function useWarehouseScopedNumberSet(storageKey: string, warehouseId: number | null) {
  const widKey = warehouseId != null ? String(warehouseId) : "";

  const [map, setMap] = useState<Record<string, number[]>>(() => {
    try {
      return parseStoredMap(typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null);
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }, [storageKey, map]);

  const selectedIds = useMemo(() => {
    if (!widKey) return new Set<number>();
    const arr = map[widKey] ?? [];
    return new Set(arr);
  }, [map, widKey]);

  const toggle = useCallback(
    (id: number, enabled: boolean) => {
      if (!widKey) return;
      setMap((prev) => {
        const cur = new Set(prev[widKey] ?? []);
        if (enabled) cur.add(id);
        else cur.delete(id);
        const nextArr = Array.from(cur).sort((a, b) => a - b);
        const next = { ...prev };
        if (nextArr.length) next[widKey] = nextArr;
        else delete next[widKey];
        return next;
      });
    },
    [widKey],
  );

  const setAll = useCallback(
    (ids: number[]) => {
      if (!widKey) return;
      setMap((prev) => {
        const next = { ...prev };
        const u = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b);
        if (u.length) next[widKey] = u;
        else delete next[widKey];
        return next;
      });
    },
    [widKey],
  );

  return { selectedIds, toggle, setAll, hasWarehouse: Boolean(widKey) };
}
