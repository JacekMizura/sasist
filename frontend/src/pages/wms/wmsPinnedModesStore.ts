/**
 * Process-wide FE mirror of WMS topbar pins.
 * Server SSOT remains user_wms_profiles.wms_topbar_pins_json;
 * this store prevents N× useWmsPinnedModes() from diverging / overwriting each other.
 */
import { putWmsTopbarPins, type WmsTopbarPinItem } from "../../api/authApi";
import { WMS_TAB_ITEMS } from "./wmsTabConfig";
import {
  normalizeWmsPinnedModes,
  writeWmsPinnedModesToStorage,
  type WmsPinnedMode,
} from "./wmsPinnedModesStorage";

type Listener = () => void;

export type WmsPinnedModesPersistHooks = {
  patchAuthPins: (pins: WmsTopbarPinItem[]) => void;
};

let modesSnapshot: WmsPinnedMode[] = [];
let hydratedKey = "";
let skipNextPersist = true;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let persistGen = 0;
let persistHooks: WmsPinnedModesPersistHooks | null = null;
const listeners = new Set<Listener>();

export function configureWmsPinnedModesPersist(hooks: WmsPinnedModesPersistHooks): void {
  persistHooks = hooks;
}

export function getWmsPinnedModesSnapshot(): WmsPinnedMode[] {
  return modesSnapshot;
}

export function getWmsPinnedModesHydratedKey(): string {
  return hydratedKey;
}

export function subscribeWmsPinnedModes(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  listeners.forEach((l) => l());
}

function parseUserIdFromHydrateKey(key: string): number | null {
  const uidRaw = key.split("|")[0];
  if (!uidRaw || uidRaw === "anon") return null;
  const uid = Number(uidRaw);
  return Number.isFinite(uid) ? uid : null;
}

function schedulePersist(): void {
  if (skipNextPersist) {
    skipNextPersist = false;
    return;
  }
  const snapshot = modesSnapshot;
  if (!snapshot.length) return;

  const uid = parseUserIdFromHydrateKey(hydratedKey);
  writeWmsPinnedModesToStorage(uid, snapshot);
  if (uid == null) return;

  const root = typeof globalThis !== "undefined" ? globalThis : undefined;
  if (saveTimer != null && root) root.clearTimeout(saveTimer);
  const gen = ++persistGen;
  if (!root) return;
  saveTimer = root.setTimeout(() => {
    saveTimer = null;
    void putWmsTopbarPins(snapshot)
      .then((saved) => {
        if (gen !== persistGen) return;
        const keys = WMS_TAB_ITEMS.map((t) => t.id);
        const normalized = normalizeWmsPinnedModes(saved as WmsTopbarPinItem[], keys);
        persistHooks?.patchAuthPins(normalized);
        modesSnapshot = normalized;
        hydratedKey = `${uid}|${JSON.stringify(normalized)}`;
        skipNextPersist = true;
        emit();
      })
      .catch(() => {
        /* local cache already written */
      });
  }, 400);
}

/** Replace snapshot (hydration or user mutation). */
export function setWmsPinnedModesSnapshot(
  next: WmsPinnedMode[],
  options?: { hydrateKey?: string; skipPersist?: boolean },
): void {
  modesSnapshot = next;
  if (options?.hydrateKey !== undefined) {
    hydratedKey = options.hydrateKey;
  }
  if (options?.skipPersist) {
    skipNextPersist = true;
  }
  emit();
  schedulePersist();
}

export function applyWmsPinnedModesUserMutation(next: WmsPinnedMode[]): void {
  skipNextPersist = false;
  modesSnapshot = next;
  emit();
  schedulePersist();
}

/** Test / HMR reset. */
export function resetWmsPinnedModesStoreForTests(): void {
  if (saveTimer != null) {
    globalThis.clearTimeout(saveTimer);
    saveTimer = null;
  }
  modesSnapshot = [];
  hydratedKey = "";
  skipNextPersist = true;
  persistGen = 0;
  persistHooks = null;
  listeners.clear();
}
