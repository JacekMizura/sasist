import { WMS_SHORTAGES_UPDATED_EVENT } from "../constants/wmsEvents";

const SHORTAGES_DISPATCH_DEBOUNCE_MS = 350;

let shortagesDispatchTimer: ReturnType<typeof setTimeout> | null = null;
let shortagesDispatchPending = false;

/** Coalesce burst dispatches (finalize + archive + OMS) into one event. */
export function dispatchWmsShortagesUpdated(): void {
  if (shortagesDispatchTimer != null) {
    shortagesDispatchPending = true;
    return;
  }
  window.dispatchEvent(new Event(WMS_SHORTAGES_UPDATED_EVENT));
  shortagesDispatchTimer = window.setTimeout(() => {
    shortagesDispatchTimer = null;
    if (shortagesDispatchPending) {
      shortagesDispatchPending = false;
      window.dispatchEvent(new Event(WMS_SHORTAGES_UPDATED_EVENT));
    }
  }, SHORTAGES_DISPATCH_DEBOUNCE_MS);
}

/** Debounced listener — prevents refresh storms when many screens subscribe. */
export function subscribeWmsShortagesUpdated(
  handler: () => void,
  options?: { debounceMs?: number; enabled?: boolean },
): () => void {
  const debounceMs = options?.debounceMs ?? 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const on = () => {
    if (options?.enabled === false) return;
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      handler();
    }, debounceMs);
  };
  window.addEventListener(WMS_SHORTAGES_UPDATED_EVENT, on);
  return () => {
    if (timer != null) window.clearTimeout(timer);
    window.removeEventListener(WMS_SHORTAGES_UPDATED_EVENT, on);
  };
}

export { createRequestDeduper, isDocumentVisible, subscribeVisibilityAwareInterval } from "./wmsRequestDeduper";
