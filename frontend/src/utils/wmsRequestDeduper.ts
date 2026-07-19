/** Request dedupe + visibility helpers — no imports from WMS route modules. */

export function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export type RequestDedupeOptions = {
  /**
   * Skip joining an in-flight promise for this key and start a fresh request.
   * Use after mutations (e.g. report-shortage) so a pre-mutation GET cannot win the race.
   */
  force?: boolean;
};

export function createRequestDeduper() {
  const inflight = new Map<string, Promise<unknown>>();
  return function dedupe<T>(key: string, fn: () => Promise<T>, options?: RequestDedupeOptions): Promise<T> {
    if (!options?.force) {
      const existing = inflight.get(key);
      if (existing) return existing as Promise<T>;
    } else {
      inflight.delete(key);
    }
    const p = fn().finally(() => {
      // Only clear if we are still the active promise for this key
      // (a newer force request may have replaced us).
      if (inflight.get(key) === p) {
        inflight.delete(key);
      }
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
