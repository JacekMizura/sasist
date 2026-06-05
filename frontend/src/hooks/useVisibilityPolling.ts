import { useEffect, useRef } from "react";
import { subscribeVisibilityAwareInterval } from "../utils/wmsRefresh";

type Options = {
  enabled?: boolean;
  intervalMs: number;
  runImmediately?: boolean;
};

/** Visibility-aware polling — disabled when tab is hidden. */
export function useVisibilityPolling(callback: () => void, options: Options): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (options.enabled === false) return undefined;
    return subscribeVisibilityAwareInterval(
      () => {
        callbackRef.current();
      },
      options.intervalMs,
      { runImmediately: options.runImmediately !== false },
    );
  }, [options.enabled, options.intervalMs, options.runImmediately]);
}
