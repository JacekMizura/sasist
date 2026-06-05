import { useMemo } from "react";

import { formatLiveEventFeedLine, type FeedLine } from "./formatRuntimeFeedLine";
import { useOperationalRuntime } from "./useOperationalRuntime";

export function useRuntimeEvents() {
  const runtime = useOperationalRuntime();

  const feedLines: FeedLine[] = useMemo(
    () => [...runtime.events].reverse().map(formatLiveEventFeedLine).slice(0, 40),
    [runtime.events],
  );

  return { ...runtime, feedLines };
}
