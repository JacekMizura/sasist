import { getStoredAccessToken } from "../auth/tokenStorage";
import { resolveAxiosBaseURL } from "../config/apiBase";
import {
  handleOperationalApiError,
  OPERATIONAL_ENDPOINTS,
} from "../services/operational/operationalFeatureGuard";
import { normalizeLiveEvent } from "../utils/normalizeOperationalApi";
import api from "./axios";

export type LiveEvent = {
  id: number;
  event_type: string;
  channel: string;
  revision?: string | null;
  payload: Record<string, unknown>;
  created_at?: string | null;
};

export type OperatorContext = {
  operator_user_id: number;
  context_type: string;
  cart_id?: number | null;
  zone_id?: number | null;
  active_task_id?: number | null;
  payload?: Record<string, unknown> | null;
  updated_at?: string | null;
};

function buildStreamUrl(tenantId: number, warehouseId: number, sinceId: number): string {
  const base = resolveAxiosBaseURL().replace(/\/+$/, "") || "/api";
  const path = `${base}/operational-runtime/stream`;
  const url = path.startsWith("http") ? new URL(path) : new URL(path, window.location.origin);
  url.searchParams.set("tenant_id", String(tenantId));
  url.searchParams.set("warehouse_id", String(warehouseId));
  url.searchParams.set("since_id", String(sinceId));
  const token = getStoredAccessToken();
  if (token) url.searchParams.set("access_token", token);
  return url.toString();
}

export async function fetchLiveEvents(params: {
  tenantId: number;
  warehouseId: number;
  sinceId?: number;
  limit?: number;
}): Promise<LiveEvent[]> {
  try {
    const { data } = await api.get<LiveEvent[]>("operational-runtime/events", {
      params: {
        tenant_id: params.tenantId,
        warehouse_id: params.warehouseId,
        since_id: params.sinceId ?? 0,
        limit: params.limit ?? 50,
      },
    });
    return (data ?? []).map(normalizeLiveEvent);
  } catch (err) {
    handleOperationalApiError(err, OPERATIONAL_ENDPOINTS.RUNTIME_EVENTS);
    throw err;
  }
}

export function openOperationalLiveStream(params: {
  tenantId: number;
  warehouseId: number;
  sinceId?: number;
  onEvent: (event: LiveEvent) => void;
  onError?: (err: unknown) => void;
}): () => void {
  const url = buildStreamUrl(params.tenantId, params.warehouseId, params.sinceId ?? 0);
  const es = new EventSource(url, { withCredentials: true });
  es.onmessage = (msg) => {
    try {
      const parsed = normalizeLiveEvent(JSON.parse(msg.data) as LiveEvent);
      params.onEvent(parsed);
    } catch (e) {
      params.onError?.(e);
    }
  };
  es.onerror = (e) => {
    params.onError?.(e);
    es.close();
  };
  return () => es.close();
}

export async function upsertOperatorContext(params: {
  tenantId: number;
  warehouseId: number;
  contextType: string;
  cartId?: number | null;
  zoneId?: number | null;
  activeTaskId?: number | null;
}): Promise<OperatorContext> {
  const { data } = await api.put<OperatorContext>(
    "operational-runtime/operator-context",
    {
      context_type: params.contextType,
      cart_id: params.cartId ?? null,
      zone_id: params.zoneId ?? null,
      active_task_id: params.activeTaskId ?? null,
    },
    {
      params: { tenant_id: params.tenantId, warehouse_id: params.warehouseId },
    },
  );
  return data;
}
