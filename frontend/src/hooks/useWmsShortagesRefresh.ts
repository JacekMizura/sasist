import { useEffect, useRef } from "react";
import { subscribeWmsShortagesUpdated } from "../utils/wmsRefresh";

type Options = {
  enabled?: boolean;
  debounceMs?: number;
};

/** Debounced ``wms:shortages-updated`` subscription — pass a stable callback via ref internally. */
export function useWmsShortagesRefresh(onRefresh: () => void, options?: Options): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (options?.enabled === false) return undefined;
    return subscribeWmsShortagesUpdated(() => {
      onRefreshRef.current();
    }, {
      debounceMs: options?.debounceMs ?? 500,
      enabled: options?.enabled !== false,
    });
  }, [options?.enabled, options?.debounceMs]);
}
