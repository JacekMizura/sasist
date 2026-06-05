import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchLiveEvents,
  openOperationalLiveStream,
  type LiveEvent,
} from "../api/operationalRuntimeApi";

type Options = {
  tenantId: number;
  warehouseId: number | null;
  enabled?: boolean;
  eventTypes?: string[];
  useSse?: boolean;
  pollMs?: number;
};

export function useOperationalLiveStream({
  tenantId,
  warehouseId,
  enabled = true,
  eventTypes,
  useSse = true,
  pollMs = 5000,
}: Options) {
  const [lastEventId, setLastEventId] = useState(0);
  const lastEventIdRef = useRef(0);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Set<(ev: LiveEvent) => void>>(new Set());

  const subscribe = useCallback((handler: (ev: LiveEvent) => void) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  const pushEvent = useCallback(
    (ev: LiveEvent) => {
      if (eventTypes?.length && !eventTypes.includes(ev.event_type)) return;
      const nextId = Math.max(lastEventIdRef.current, ev.id);
      lastEventIdRef.current = nextId;
      setLastEventId(nextId);
      setEvents((prev) => [...prev.slice(-49), ev]);
      handlersRef.current.forEach((h) => h(ev));
    },
    [eventTypes],
  );

  useEffect(() => {
    if (!enabled || warehouseId == null) {
      setConnected(false);
      return;
    }

    let cancelled = false;
    let closeSse: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      try {
        const batch = await fetchLiveEvents({
          tenantId,
          warehouseId,
          sinceId: lastEventIdRef.current,
        });
        if (cancelled) return;
        batch.forEach(pushEvent);
        setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };

    if (useSse && typeof EventSource !== "undefined") {
      closeSse = openOperationalLiveStream({
        tenantId,
        warehouseId,
        sinceId: lastEventIdRef.current,
        onEvent: (ev) => {
          if (!cancelled) {
            pushEvent(ev);
            setConnected(true);
          }
        },
        onError: () => {
          if (!cancelled) setConnected(false);
        },
      });
    } else {
      void poll();
      pollTimer = setInterval(() => void poll(), pollMs);
    }

    return () => {
      cancelled = true;
      closeSse?.();
      if (pollTimer) clearInterval(pollTimer);
      setConnected(false);
    };
  }, [enabled, warehouseId, tenantId, useSse, pollMs, pushEvent]);

  return { events, lastEventId, connected, subscribe };
}
