import type { WmsPinnedMode } from "./wmsPinnedModesStorage";
import { defaultWmsPinnedModes, normalizeWmsPinnedModes } from "./wmsPinnedModesStorage";
import { WMS_TAB_ITEMS } from "./wmsTabConfig";

function catalogKeys(): string[] {
  return WMS_TAB_ITEMS.map((t) => t.id);
}

function ensureCatalog(prev: WmsPinnedMode[]): WmsPinnedMode[] {
  return normalizeWmsPinnedModes(prev.length ? prev : defaultWmsPinnedModes(), catalogKeys());
}

/** Unpin: pinned=false + compact orders among remaining pinned. Pin: append at end of pinned. */
export function applyTogglePin(prev: WmsPinnedMode[], key: string): WmsPinnedMode[] {
  const base = ensureCatalog(prev);
  const idx = base.findIndex((x) => x.key === key);
  if (idx === -1) return prev;

  const cur = base[idx];
  if (cur.pinned) {
    const next = [...base];
    next[idx] = { ...cur, pinned: false, order: 0 };
    const pinned = next.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
    const orderByKey = new Map<string, number>();
    pinned.forEach((m, i) => orderByKey.set(m.key, i));
    return next.map((m) => (m.pinned ? { ...m, order: orderByKey.get(m.key) ?? m.order } : m));
  }

  const maxOrder = Math.max(-1, ...base.filter((m) => m.pinned).map((m) => m.order));
  const next = [...base];
  next[idx] = { ...cur, pinned: true, order: maxOrder + 1 };
  return next;
}

/** Swap order among pinned only. Unpinned never participate. */
export function applyMovePinned(prev: WmsPinnedMode[], key: string, delta: -1 | 1): WmsPinnedMode[] {
  const base = ensureCatalog(prev);
  const pinned = base.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
  const pos = pinned.findIndex((m) => m.key === key);
  if (pos < 0) return prev;
  const swapWith = pos + delta;
  if (swapWith < 0 || swapWith >= pinned.length) return prev;

  const reordered = [...pinned];
  const tmp = reordered[pos];
  reordered[pos] = reordered[swapWith];
  reordered[swapWith] = tmp;
  const orderByKey = new Map(reordered.map((m, i) => [m.key, i]));
  return base.map((m) => (m.pinned ? { ...m, order: orderByKey.get(m.key) ?? m.order } : m));
}

export function applyReorderPinned(
  prev: WmsPinnedMode[],
  activeKey: string,
  overKey: string,
): WmsPinnedMode[] {
  if (activeKey === overKey) return prev;
  const base = ensureCatalog(prev);
  const pinned = base.filter((m) => m.pinned).sort((a, b) => a.order - b.order);
  const oldIndex = pinned.findIndex((m) => m.key === activeKey);
  const newIndex = pinned.findIndex((m) => m.key === overKey);
  if (oldIndex < 0 || newIndex < 0) return prev;
  const reordered = [...pinned];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  const orderByKey = new Map(reordered.map((m, i) => [m.key, i]));
  return base.map((m) => (m.pinned ? { ...m, order: orderByKey.get(m.key) ?? m.order } : m));
}

export function pinnedKeysInOrder(modes: WmsPinnedMode[]): string[] {
  return modes
    .filter((m) => m.pinned)
    .sort((a, b) => a.order - b.order)
    .map((m) => m.key);
}
