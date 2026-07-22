import axios from "axios";

import { logOperationalOnce } from "./operationalLog";
import type { OperationalUnavailableReason } from "./operationalUnavailableCopy";

export type OperationalFeaturesPayload = {
  direct_sales: boolean;
  runtime: boolean;
  replenishment: boolean;
};

export type OperationalFeatureState = {
  /** Raw flag from GET /operational/features */
  directSalesFlag: boolean;
  runtimeFlag: boolean;
  replenishmentFlag: boolean;
  directSalesEnabled: boolean;
  runtimeEnabled: boolean;
  replenishmentEnabled: boolean;
  directSalesSearchEnabled: boolean;
  backendReachable: boolean;
  loaded: boolean;
  loading: boolean;
  unavailableReason: OperationalUnavailableReason;
  rawPayload: OperationalFeaturesPayload | null;
  blockedEndpoints: string[];
};

export const OPERATIONAL_ENDPOINTS = {
  FEATURES: "operational/features",
  DIRECT_SALES_SESSION: "direct-sales/session",
  DIRECT_SALES_SEARCH: "direct-sales/products/search",
  RUNTIME_EVENTS: "operational-runtime/events",
  RUNTIME_STREAM: "operational-runtime/stream",
} as const;

let cacheKey = "";
let features: OperationalFeaturesPayload | null = null;
let featuresFetchFailed = false;
/** Last features probe ended with HTTP 401/403 — do not pretend flags are OFF. */
let featuresAuthFailed = false;
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

function clearDirectSalesBlocksIfEnabled(payload: OperationalFeaturesPayload): void {
  if (!payload.direct_sales) return;
  blockedEndpoints.delete(OPERATIONAL_ENDPOINTS.DIRECT_SALES_SESSION);
  blockedEndpoints.delete(OPERATIONAL_ENDPOINTS.DIRECT_SALES_SEARCH);
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
  if (endpoint.includes("operational/features")) {
    featuresFetchFailed = true;
    if (status === 401 || status === 403) {
      featuresAuthFailed = true;
      logOperationalOnce("features-auth", "[operations] feature probe auth failed (401/403) — not masking as OFF");
    } else {
      logOperationalOnce("features-fail", "[operations] feature probe failed");
    }
  } else if (endpoint.includes("direct-sales/products/search")) {
    logOperationalOnce("ds-search", "[operations] direct sales search unavailable");
  } else if (endpoint.includes("direct-sales")) {
    logOperationalOnce("ds-session", "[operations] direct sales session endpoint unavailable");
  } else if (endpoint.includes("operational-runtime")) {
    logOperationalOnce("runtime", "[operations] runtime endpoint unavailable");
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
  if (status === 401 || status === 403) {
    markEndpointUnavailable(endpoint, status);
    return;
  }
  if (isOperationalUnavailableStatus(status)) {
    markEndpointUnavailable(endpoint, status);
  }
}

function resolveUnavailableReason(f: OperationalFeaturesPayload | null): OperationalUnavailableReason {
  if (featuresAuthFailed) return "auth";
  if (featuresFetchFailed) return "network";
  if (!f) return "network";
  if (!f.direct_sales) return "off";
  if (isEndpointBlocked(OPERATIONAL_ENDPOINTS.DIRECT_SALES_SESSION)) return "backend";
  return null;
}

function buildState(): OperationalFeatureState {
  const f = features;
  const searchBlocked = isEndpointBlocked(OPERATIONAL_ENDPOINTS.DIRECT_SALES_SEARCH);
  return {
    directSalesFlag: f != null ? f.direct_sales : false,
    runtimeFlag: f != null ? f.runtime : false,
    replenishmentFlag: f != null ? f.replenishment : false,
    directSalesEnabled:
      f != null && f.direct_sales && !isEndpointBlocked(OPERATIONAL_ENDPOINTS.DIRECT_SALES_SESSION) && !featuresAuthFailed,
    runtimeEnabled: f != null && f.runtime && !isEndpointBlocked(OPERATIONAL_ENDPOINTS.RUNTIME_EVENTS) && !featuresAuthFailed,
    replenishmentEnabled: f != null && f.replenishment && !featuresAuthFailed,
    directSalesSearchEnabled: f != null && f.direct_sales && !searchBlocked && !featuresAuthFailed,
    backendReachable: features != null && !featuresFetchFailed && !featuresAuthFailed,
    loaded: features != null || featuresFetchFailed || featuresAuthFailed,
    loading: inflight != null,
    unavailableReason: resolveUnavailableReason(f),
    rawPayload: features,
    blockedEndpoints: [...blockedEndpoints],
  };
}

export function getOperationalFeatureState(): OperationalFeatureState {
  return buildState();
}

export function applyOperationalFeaturesPayload(payload: OperationalFeaturesPayload): void {
  features = payload;
  featuresFetchFailed = false;
  featuresAuthFailed = false;
  clearDirectSalesBlocksIfEnabled(payload);
  console.info("[operational.features]", payload);
  notify();
}

export async function loadOperationalFeatures(
  tenantId: number,
  warehouseId: number,
  fetcher: (tenantId: number, warehouseId: number) => Promise<OperationalFeaturesPayload>,
): Promise<OperationalFeatureState> {
  const key = `${tenantId}:${warehouseId}`;
  if (features && cacheKey === key && !featuresFetchFailed && !featuresAuthFailed) return buildState();

  if (!inflight) {
    inflight = fetcher(tenantId, warehouseId)
      .then((payload) => {
        features = payload;
        featuresFetchFailed = false;
        featuresAuthFailed = false;
        cacheKey = key;
        clearDirectSalesBlocksIfEnabled(payload);
        console.info("[operational.features]", payload);
        return payload;
      })
      .catch((err) => {
        const status = classifyAxiosOperationalError(err);
        handleOperationalApiError(err, OPERATIONAL_ENDPOINTS.FEATURES);
        // Do not invent fake feature flags on auth failure — leave null and surface "auth".
        if (status === 401 || status === 403) {
          features = null;
          featuresAuthFailed = true;
          featuresFetchFailed = true;
          cacheKey = key;
          logOperationalOnce(
            "features-auth",
            "[operations] feature probe 401/403 — not applying DEFAULT_FEATURES fallback",
          );
        } else {
          features = null;
          featuresFetchFailed = true;
          featuresAuthFailed = false;
          cacheKey = key;
          logOperationalOnce("features-fail", "[operations] feature probe failed — flags unknown (not OFF)");
        }
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
  featuresFetchFailed = false;
  featuresAuthFailed = false;
  blockedEndpoints.clear();
  notify();
}

export function resolveDirectSalesUnavailableReason(
  features: OperationalFeatureState,
  sessionUnavailable: boolean,
): OperationalUnavailableReason {
  if (features.unavailableReason === "auth") return "auth";
  if (!features.backendReachable) return "network";
  if (!features.directSalesFlag) return "off";
  if (sessionUnavailable || isEndpointBlocked(OPERATIONAL_ENDPOINTS.DIRECT_SALES_SESSION)) return "backend";
  if (!features.directSalesEnabled) return "backend";
  return null;
}
