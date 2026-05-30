import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import { getApiBaseUrl } from "../config/apiBase";
import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredTokens,
} from "../auth/tokenStorage";

const apiBase = (getApiBaseUrl() || "").replace(/\/+$/, "");

/**
 * Production:
 *   https://domain/api
 *
 * Dev with Vite proxy:
 *   /api
 */
const resolvedBaseUrl = apiBase || "/api";

const api = axios.create({
  baseURL: `${resolvedBaseUrl}/`,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

/** Client without interceptors (refresh only). */
const refreshClient = axios.create({
  baseURL: `${resolvedBaseUrl}/`,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

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

api.interceptors.request.use(
  (config) => {
    const u = config.url;

    /**
     * Prevent accidental absolute http:// urls
     */
    if (typeof u === "string") {
      if (u.startsWith("http://")) {
        config.url = u.replace("http://", "https://");
      }

      if (u.startsWith("/") && !/^https?:\/\//i.test(u)) {
        config.url = u.replace(/^\/+/, "");
      }
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
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetryConfig | undefined;

    console.error(
      "[API] Request failed:",
      original?.url,
      status,
      error.message,
    );

    if (
      status !== 401 ||
      !original ||
      original._retryAfterRefresh ||
      isAuthNoRetryUrl(original.url)
    ) {
      return Promise.reject(error);
    }

    const nextAccess = await refreshAccessToken();

    if (!nextAccess) {
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