const STORAGE_PREFIX = "ui.filterFields.v1:";

/**
 * Load ordered **visible** filter field ids.
 * - Missing / invalid storage → all `catalogIds` visible in catalog order.
 * - Saved array lists only visible fields (subset). Omitted ids stay hidden (e.g. new app fields until user adds them).
 * - If user clears everything, fall back to full catalog.
 */
export function loadVisibleFieldOrder(storageKey: string, catalogIds: readonly string[]): string[] {
  const valid = new Set(catalogIds);
  const lsKey = STORAGE_PREFIX + storageKey;
  try {
    const raw = localStorage.getItem(lsKey);
    console.log("[LS]", lsKey, raw);
    if (raw == null || raw === "") return [...catalogIds];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (e) {
      console.error("[LS] filterVisibility JSON.parse failed", lsKey, e);
      return [...catalogIds];
    }
    if (!Array.isArray(parsed)) return [...catalogIds];
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      if (!valid.has(item)) continue;
      if (out.includes(item)) continue;
      out.push(item);
    }
    if (out.length === 0) return [...catalogIds];
    return out;
  } catch {
    return [...catalogIds];
  }
}

export function saveVisibleFieldOrder(storageKey: string, order: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify([...order]));
  } catch {
    /* ignore quota / private mode */
  }
}
