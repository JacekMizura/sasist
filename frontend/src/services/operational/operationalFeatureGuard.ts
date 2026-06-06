import axios from "axios";

import { logOperationalOnce } from "./operationalLog";

export type OperationalFeaturesPayload = {
  direct_sales: boolean;
  runtime: boolean;
  replenishment: boolean;
};

export type OperationalFeatureState = {
  directSalesEnabled: boolean;
  runtimeEnabled: boolean;
  replenishmentEnabled: boolean;
  directSalesSearchEnabled: boolean;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

const ENDPOINT = {
  FEATURES: "operational/features",
  DIRECT_SALES_SESSION: "direct-sales/session",
  DIRECT_SALES_SEARCH: "direct-sales/products/search",
  RUNTIME_EVENTS: "operational-runtime/events",
  RUNTIME_STREAM: "operational-runtime/stream",
} as const;

type EndpointKey = (typeof ENDPOINT)[keyof typeof ENDPOINT];

let cacheKey = "";
let features: OperationalFeaturesPayload | null = null;
let inflight: Promise<OperationalFeaturesPayload | null> | null = null;
const blockedEndpoints = new Set<string>();
const listeners = new Set<() => void>();

const DEFAULT_FEATURES: OperationalFeaturesPayload = {
  direct_sales: false,
  runtime: false,
  replenishment: false,
};

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function subscribeOperationalFeatures(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isOperationalUnavailableStatus(status: number | undefined): boolean {
  return status === 404 || status === 403 || status === 501 || status === 503;
}

export function markEndpointUnavailable(endpoint: string, status?: number): void {
  blockedEndpoints.add(endpoint);
  if (endpoint.includes("direct-sales/products/search")) {
    logOperationalOnce("ds-search", "[operations] direct sales search unavailable, using fallback mode");
  } else if (endpoint.includes("direct-sales")) {
    features = { ...(features ?? DEFAULT_FEATURES), direct_sales: false };
    logOperationalOnce("ds", "[operations] direct sales unavailable, using fallback mode");
  } else if (endpoint.includes("operational-runtime")) {
    features = { ...(features ?? DEFAULT_FEATURES), runtime: false };
    logOperationalOnce("runtime", "[operations] runtime unavailable, using fallback mode");
  } else if (endpoint.includes("operational-replenishment") || endpoint.includes("replenishment")) {
    features = { ...(features ?? DEFAULT_FEATURES), replenishment: false };
    logOperationalOnce("replenishment", "[operations] replenishment unavailable, using fallback mode");
  }
  if (status != null && isOperationalUnavailableStatus(status)) {
    logOperationalOnce(`http-${endpoint}`, `[operations] ${endpoint} returned ${status}`);
  }
  notify();
}

export function isEndpointBlocked(endpoint: string): boolean {
  return blockedEndpoints.has(endpoint);
}

export function classifyAxiosOperationalError(err: unknown): number | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  return err.response?.status;
}

export function handleOperationalApiError(err: unknown, endpoint: string): void {
  const status = classifyAxiosOperationalError(err);
  if (status == null && axios.isAxiosError(err) && !err.response) {
    markEndpointUnavailable(endpoint);
    return;
  }
  if (isOperationalUnavailableStatus(status)) {
    markEndpointUnavailable(endpoint, status);
  }
}

function buildState(): OperationalFeatureState {
  const f = features ?? DEFAULT_FEATURES;
  const searchBlocked = isEndpointBlocked(ENDPOINT.DIRECT_SALES_SEARCH);
  return {
    directSalesEnabled: f.direct_sales && !isEndpointBlocked(ENDPOINT.DIRECT_SALES_SESSION),
    runtimeEnabled: f.runtime && !isEndpointBlocked(ENDPOINT.RUNTIME_EVENTS),
    replenishmentEnabled: f.replenishment,
    directSalesSearchEnabled: f.direct_sales && !searchBlocked,
    loaded: features != null,
    loading: inflight != null,
    error: null,
  };
}

export function getOperationalFeatureState(): OperationalFeatureState {
  return buildState();
}

export async function loadOperationalFeatures(
  tenantId: number,
  warehouseId: number,
  fetcher: (tenantId: number, warehouseId: number) => Promise<OperationalFeaturesPayload>,
): Promise<OperationalFeatureState> {
  const key = `${tenantId}:${warehouseId}`;
  if (features && cacheKey === key) return buildState();

  if (!inflight) {
    inflight = fetcher(tenantId, warehouseId)
      .then((payload) => {
        features = payload;
        cacheKey = key;
        return payload;
      })
      .catch((err) => {
        handleOperationalApiError(err, ENDPOINT.FEATURES);
        features = DEFAULT_FEATURES;
        cacheKey = key;
        logOperationalOnce("features-fail", "[operations] feature probe failed, using fallback mode");
        return null;
      })
      .finally(() => {
        inflight = null;
        notify();
      });
  }

  await inflight;
  return buildState();
}

export function resetOperationalFeatureCache(): void {
  features = null;
  cacheKey = "";
  blockedEndpoints.clear();
  notify();
}

export { ENDPOINT as OPERATIONAL_ENDPOINTS };
