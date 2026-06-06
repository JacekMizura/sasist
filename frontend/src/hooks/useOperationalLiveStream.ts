import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchLiveEvents,
  openOperationalLiveStream,
  type LiveEvent,
} from "../api/operationalRuntimeApi";
import {
  handleOperationalApiError,
  markEndpointUnavailable,
  OPERATIONAL_ENDPOINTS,
} from "../services/operational/operationalFeatureGuard";
import { logOperationalOnce } from "../services/operational/operationalLog";

type LiveMode = "sse" | "polling" | "off";

type Options = {
  tenantId: number;
  warehouseId: number | null;
  enabled?: boolean;
  eventTypes?: string[];
  pollMs?: number;
};

export function useOperationalLiveStream({
  tenantId,
  warehouseId,
  enabled = true,
  eventTypes,
  pollMs = 8000,
}: Options) {
  const [lastEventId, setLastEventId] = useState(0);
  const lastEventIdRef = useRef(0);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [liveMode, setLiveMode] = useState<LiveMode>("off");
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
      setLiveMode("off");
      return;
    }

    let cancelled = false;
    let closeSse: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let mode: LiveMode = "sse";

    const disableLive = () => {
      if (cancelled) return;
      mode = "off";
      setLiveMode("off");
      setConnected(false);
      closeSse?.();
      closeSse = undefined;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = undefined;
    };

    const startPolling = () => {
      if (cancelled || mode === "off") return;
      mode = "polling";
      setLiveMode("polling");
      closeSse?.();
      closeSse = undefined;

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
        } catch (err) {
          if (cancelled) return;
          handleOperationalApiError(err, OPERATIONAL_ENDPOINTS.RUNTIME_EVENTS);
          setConnected(false);
          logOperationalOnce("live-off", "[operations] live stream unavailable, using fallback mode");
          disableLive();
        }
      };

      void poll();
      pollTimer = setInterval(() => void poll(), pollMs);
    };

    const connectSse = () => {
      if (cancelled || typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      closeSse?.();
      closeSse = openOperationalLiveStream({
        tenantId,
        warehouseId,
        sinceId: lastEventIdRef.current,
        onEvent: (ev) => {
          if (cancelled) return;
          pushEvent(ev);
          setConnected(true);
          setLiveMode("sse");
        },
        onError: () => {
          if (cancelled) return;
          setConnected(false);
          markEndpointUnavailable(OPERATIONAL_ENDPOINTS.RUNTIME_STREAM);
          logOperationalOnce("sse-fallback", "[operations] SSE unavailable, falling back to polling");
          startPolling();
        },
      });
    };

    if (typeof EventSource !== "undefined") {
      mode = "sse";
      setLiveMode("sse");
      connectSse();
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      mode = "off";
      closeSse?.();
      if (pollTimer) clearInterval(pollTimer);
      setConnected(false);
      setLiveMode("off");
    };
  }, [enabled, warehouseId, tenantId, pollMs, pushEvent]);

  return { events, lastEventId, connected, liveMode, subscribe };
}
