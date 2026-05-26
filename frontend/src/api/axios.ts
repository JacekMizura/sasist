import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import { getApiBaseUrl } from "../config/apiBase";
import {
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  setStoredTokens,
} from "../auth/tokenStorage";

const apiBase = getApiBaseUrl();

if (!apiBase) {
  console.error(
    "[api] VITE_API_URL is missing — in production set it in frontend/.env (e.g. https://api.example.com/api). " +
      "In dev, leave it unset to use the Vite proxy (/api → FastAPI on this PC).",
  );
}

const rawBase = (apiBase || "").replace(/\/+$/, "");

const api = axios.create({
  baseURL: rawBase ? `${rawBase}/` : undefined,
});

/** Bez interceptorów — tylko odświeżanie access tokena (unika pętli). */
const refreshClient = axios.create({
  baseURL: rawBase ? `${rawBase}/` : undefined,
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
      const res = await refreshClient.post<{ access_token: string; refresh_token: string }>("/auth/refresh", {
        refresh_token: rt,
      });
      const { access_token, refresh_token } = res.data;
      setStoredTokens(access_token, refresh_token);
      return access_token;
    } catch {
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
  return u.startsWith("auth/login") || u.startsWith("auth/refresh") || u.startsWith("auth/logout");
}

type RetryConfig = InternalAxiosRequestConfig & { _retryAfterRefresh?: boolean };

api.interceptors.request.use(
  (config) => {
    if (!getApiBaseUrl()) {
      const msg =
        "[api] VITE_API_URL is not set. For dev, restart Vite with empty VITE_API_URL to use the LAN proxy. " +
        "For production build, set VITE_API_URL in frontend/.env.";
      console.error(msg);
      return Promise.reject(new Error(msg));
    }

    const u = config.url;
    if (typeof u === "string" && u.startsWith("/") && !/^https?:\/\//i.test(u)) {
      config.url = u.replace(/^\/+/, "");
    }

    const token = getStoredAccessToken();
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }

    if (import.meta.env.DEV && typeof u === "string") {
      const path = u.replace(/^\/+/, "");
      if (path.startsWith("auth/users") || path.startsWith("workforce/")) {
        // Temporary diagnostics for admin/workforce 401 investigations (dev only).
        // eslint-disable-next-line no-console
        console.debug("[api-auth-debug]", {
          url: path,
          hasBearer: Boolean(token),
          hasAuthHeader: Boolean((config.headers as Record<string, string> | undefined)?.Authorization),
        });
      }
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

    console.error("[API] Request failed:", original?.url, status, error.message);

    if (status !== 401 || !original || original._retryAfterRefresh || isAuthNoRetryUrl(original.url)) {
      return Promise.reject(error);
    }

    const nextAccess = await refreshAccessToken();
    if (!nextAccess) {
      return Promise.reject(error);
    }

    original._retryAfterRefresh = true;
    original.headers = original.headers ?? {};
    (original.headers as Record<string, string>).Authorization = `Bearer ${nextAccess}`;
    return api.request(original);
  },
);

export default api;
