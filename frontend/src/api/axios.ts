import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import { extractApiErrorMessage } from "./apiErrorMessage";

import {
  applySecureApiBaseToConfig,
  getAxiosRequestDebugUrl,
  logApiBaseDebug,
  resolveAxiosBaseURL,
} from "../config/apiBase";
import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredTokens,
} from "../auth/tokenStorage";
import { emitAuthSessionExpired } from "../auth/authEvents";

const resolvedBaseUrl = resolveAxiosBaseURL().replace(/\/+$/, "") || "/api";

const api = axios.create({
  baseURL: `${resolvedBaseUrl}/`,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

const refreshClient = axios.create({
  baseURL: `${resolvedBaseUrl}/`,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

logApiBaseDebug("axios module init");
console.log("API BASE URL", api.defaults.baseURL);

if (import.meta.env.PROD && String(api.defaults.baseURL).startsWith("http://")) {
  console.error("[api] INSECURE baseURL in production bundle:", api.defaults.baseURL);
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const rt = getStoredRefreshToken();

    if (!rt) {
      clearStoredTokens();
      return null;
    }

    try {
      const res = await refreshClient.post<{
        access_token: string;
        refresh_token: string;
      }>("auth/refresh", {
        refresh_token: rt,
      });

      const { access_token, refresh_token } = res.data;

      setStoredTokens(access_token, refresh_token);

      return access_token;
    } catch (err) {
      console.error("[auth] refresh failed", err);
      clearStoredTokens();
      emitAuthSessionExpired();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function isAuthNoRetryUrl(url: string | undefined): boolean {
  if (!url) return false;

  const u = url.replace(/^\/+/, "");

  return (
    u.startsWith("auth/login") ||
    u.startsWith("auth/refresh") ||
    u.startsWith("auth/logout")
  );
}

type RetryConfig = InternalAxiosRequestConfig & {
  _retryAfterRefresh?: boolean;
};

function isCustomersApiRequest(config: InternalAxiosRequestConfig): boolean {
  const path = String(config.url ?? "");
  return path === "customers" || path.startsWith("customers/") || path.startsWith("/customers");
}

function isDirectSalesApiRequest(config: InternalAxiosRequestConfig): boolean {
  const path = String(config.url ?? "").replace(/^\/+/, "");
  return path === "direct-sales" || path.startsWith("direct-sales/");
}

api.interceptors.request.use(
  (config) => {
    applySecureApiBaseToConfig(config);

    const finalUrl = getAxiosRequestDebugUrl(config);
    if (isCustomersApiRequest(config)) {
      console.trace("CUSTOMERS REQUEST (axios)", finalUrl);
      console.log("FULL REQUEST CONFIG", config);
    }
    if (isDirectSalesApiRequest(config)) {
      console.log("[direct-sales.request]", {
        url: finalUrl,
        method: (config.method ?? "get").toUpperCase(),
        params: config.params,
        data: config.data,
        contentType: (config.headers as Record<string, string> | undefined)?.["Content-Type"],
      });
    }
    if (finalUrl.startsWith("http://")) {
      console.error("[api] BLOCKED insecure request URL:", finalUrl, {
        viteApiUrlEnv: import.meta.env.VITE_API_URL,
        baseURL: config.baseURL,
        path: config.url,
      });
      throw new Error(`[api] Refusing HTTP API request: ${finalUrl}`);
    }

    if (config.data instanceof FormData) {
      const headers = config.headers as Record<string, unknown>;
      delete headers["Content-Type"];
      delete headers["content-type"];
    }

    const token = getStoredAccessToken();

    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (err) => Promise.reject(err),
);

api.interceptors.response.use(
  (response) => {
    const cfg = response.config;
    if (cfg && isCustomersApiRequest(cfg)) {
      const responseUrl =
        typeof response.request?.responseURL === "string" ? response.request.responseURL : null;
      if (response.status >= 300 && response.status < 400) {
        console.warn("[api] customers redirect response", {
          status: response.status,
          location: response.headers?.location,
          responseURL: responseUrl,
        });
      }
    }
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetryConfig | undefined;

    console.error(
      "[API] Request failed:",
      original ? getAxiosRequestDebugUrl(original) : original?.url,
      status,
      error.message,
    );

    if (
      status !== 401 ||
      !original ||
      original._retryAfterRefresh ||
      isAuthNoRetryUrl(original.url)
    ) {
      const friendly = extractApiErrorMessage(error);
      if (friendly && error instanceof Error) {
        error.message = friendly;
      }
      return Promise.reject(error);
    }

    const nextAccess = await refreshAccessToken();

    if (!nextAccess) {
      emitAuthSessionExpired();
      return Promise.reject(error);
    }

    original._retryAfterRefresh = true;
    original.headers = original.headers ?? {};

    (original.headers as Record<string, string>).Authorization =
      `Bearer ${nextAccess}`;

    return api.request(original);
  },
);

export default api;
