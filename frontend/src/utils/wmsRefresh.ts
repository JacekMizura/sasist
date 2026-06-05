import { WMS_SHORTAGES_UPDATED_EVENT } from "../pages/wms/wmsRoutes";

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

export function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
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

export function createRequestDeduper() {
  const inflight = new Map<string, Promise<unknown>>();
  return function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, p);
    return p;
  };
}

/** Interval that pauses when tab/window is hidden. */
export function subscribeVisibilityAwareInterval(
  callback: () => void,
  intervalMs: number,
  options?: { runImmediately?: boolean },
): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    if (!isDocumentVisible()) return;
    callback();
  };

  const start = () => {
    if (intervalId != null) return;
    intervalId = window.setInterval(tick, intervalMs);
  };

  const stop = () => {
    if (intervalId != null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };

  const onVisibility = () => {
    if (isDocumentVisible()) {
      tick();
      start();
    } else {
      stop();
    }
  };

  if (options?.runImmediately !== false && isDocumentVisible()) {
    tick();
  }
  if (isDocumentVisible()) {
    start();
  }
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
