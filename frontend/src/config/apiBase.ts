/**
 * Axios `baseURL` comes only from `import.meta.env.VITE_API_URL` (build-time on Vercel).
 * Non-local hosts are always forced to `https:` — no http fallbacks.
 */

import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";

import { log } from "../utils/logger";

const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalApiHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return LOCAL_API_HOSTS.has(h) || h.endsWith(".local");
}

/** Parse env value; bare hosts get https://; never leave public hosts on http:. */
function parseApiBaseUrl(raw: string): string {
  let t = raw.trim().replace(/\/+$/, "");
  if (!t) return "";

  if (t.startsWith("/")) return t;

  if (t.startsWith("//")) {
    t = `https:${t}`;
  } else if (!/^https?:\/\//i.test(t)) {
    t = `https://${t.replace(/^\/+/, "")}`;
  }

  const u = new URL(t);

  if (u.pathname === "" || u.pathname === "/") {
    u.pathname = "/api";
  }

  if (u.protocol === "http:" && !isLocalApiHost(u.hostname)) {
    u.protocol = "https:";
  }

  return u.toString().replace(/\/+$/, "");
}

function warnIfApiPointsToViteDev(base: string) {
  if (!import.meta.env.DEV || !base || base.startsWith("/")) return;
  try {
    if (new URL(base).port === "5173") {
      console.error(
        "[api] VITE_API_URL must point to FastAPI (e.g. :8010/api), not the Vite dev server (:5173)."
      );
    }
  } catch {
    /* ignore */
  }
}

function warnIfApiPointsToFrontendHost(base: string) {
  if (!base.startsWith("http://") && !base.startsWith("https://")) return;
  if (typeof window === "undefined") return;
  try {
    if (new URL(base).host === window.location.host) {
      console.error("[api] VITE_API_URL must point to the backend API host, not the SPA host.");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Single source for axios `baseURL` (from `VITE_API_URL` only).
 */
export function resolveAxiosBaseURL(): string {
  const raw = import.meta.env.VITE_API_URL;
  const fromEnv = typeof raw === "string" && raw.trim() ? parseApiBaseUrl(raw) : "";

  if (fromEnv) {
    warnIfApiPointsToViteDev(fromEnv);
    warnIfApiPointsToFrontendHost(fromEnv);
    return fromEnv;
  }

  return "/api";
}

/** @deprecated use resolveAxiosBaseURL */
export function getApiBaseUrl(): string {
  return resolveAxiosBaseURL();
}

/** Legacy name — same as parse-time https enforcement. */
export function coerceHttpsUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("//")) {
    return url;
  }
  try {
    return parseApiBaseUrl(url.startsWith("//") ? url : url);
  } catch {
    if (url.startsWith("http://")) {
      return `https://${url.slice("http://".length)}`;
    }
    return url;
  }
}

export function buildApiUrl(path: string): string {
  const base = resolveAxiosBaseURL().replace(/\/+$/, "");
  const segment = path.replace(/^\/+/, "");
  return `${base}/${segment}`;
}

export function getBackendPublicOrigin(): string {
  const base = resolveAxiosBaseURL().replace(/\/+$/, "");
  if (!base || base.startsWith("/")) return typeof window !== "undefined" ? window.location.origin : "";
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}

export function getWmsPhotoUploadOrigin(): string {
  const base = resolveAxiosBaseURL().replace(/\/+$/, "");
  if (!base || base === "/api") {
    return typeof window !== "undefined" ? window.location.origin : "";
  }
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const root = base.endsWith("/api") ? base.slice(0, -4) : base;
    return root.replace(/\/+$/, "");
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** Apply secure baseURL on every request (guards against stale module init / overrides). */
export function applySecureApiBaseToConfig(config: InternalAxiosRequestConfig): void {
  const base = resolveAxiosBaseURL().replace(/\/+$/, "") + "/";
  config.baseURL = base;

  if (typeof config.url === "string" && config.url.startsWith("http://")) {
    config.url = parseApiBaseUrl(config.url);
  }
  if (typeof config.url === "string" && config.url.startsWith("/") && !/^https?:\/\//i.test(config.url)) {
    config.url = config.url.replace(/^\/+/, "");
  }
}

/** Final URL axios will request (for debugging mixed-content). */
export function getAxiosRequestDebugUrl(config: InternalAxiosRequestConfig): string {
  try {
    return axios.getUri({
      ...config,
      baseURL: config.baseURL ?? resolveAxiosBaseURL().replace(/\/+$/, "") + "/",
    });
  } catch {
    return `${config.baseURL ?? ""}${config.url ?? ""}`;
  }
}

export function logApiBaseDebug(context: string): void {
  if (!import.meta.env.DEV) return;
  const resolved = resolveAxiosBaseURL().replace(/\/+$/, "") + "/";
  log(`[api] ${context}`, {
    viteApiUrlEnv: import.meta.env.VITE_API_URL,
    resolvedBaseURL: resolved,
    mode: import.meta.env.MODE,
    prod: import.meta.env.PROD,
    dev: import.meta.env.DEV,
  });
}
