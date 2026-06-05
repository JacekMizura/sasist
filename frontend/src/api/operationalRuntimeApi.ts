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

export async function fetchLiveEvents(params: {
  tenantId: number;
  warehouseId: number;
  sinceId?: number;
  limit?: number;
}): Promise<LiveEvent[]> {
  const { data } = await api.get<LiveEvent[]>("operational-runtime/events", {
    params: {
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      since_id: params.sinceId ?? 0,
      limit: params.limit ?? 50,
    },
  });
  return data;
}

export function openOperationalLiveStream(params: {
  tenantId: number;
  warehouseId: number;
  sinceId?: number;
  onEvent: (event: LiveEvent) => void;
  onError?: (err: unknown) => void;
}): () => void {
  const base = (api.defaults.baseURL ?? "/api").replace(/\/+$/, "");
  const url = new URL(`${base}/operational-runtime/stream`, window.location.origin);
  url.searchParams.set("tenant_id", String(params.tenantId));
  url.searchParams.set("warehouse_id", String(params.warehouseId));
  url.searchParams.set("since_id", String(params.sinceId ?? 0));

  const es = new EventSource(url.toString());
  es.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as LiveEvent;
      params.onEvent(parsed);
    } catch (e) {
      params.onError?.(e);
    }
  };
  es.onerror = (e) => params.onError?.(e);
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
  const { data } = await api.put<OperatorContext>("operational-runtime/operator-context", {
    context_type: params.contextType,
    cart_id: params.cartId ?? null,
    zone_id: params.zoneId ?? null,
    active_task_id: params.activeTaskId ?? null,
  }, {
    params: { tenant_id: params.tenantId, warehouse_id: params.warehouseId },
  });
  return data;
}
