/** Request dedupe + visibility helpers — no imports from WMS route modules. */

export function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
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
