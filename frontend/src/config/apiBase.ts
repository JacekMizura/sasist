/**
 * FastAPI axios `baseURL` must include the **`/api` path**, e.g.:
 * - Dev (recommended): relative `/api` — Vite proxies to the backend (LAN + HTTPS safe).
 * - Production: `https://your-backend.example.com/api` or relative `/api` on same host.
 *
 * Static files: `/uploads/...` — use same host as the page when using the dev proxy.
 */

/** Upgrade `http://` API bases when the app runs on HTTPS (avoids mixed-content blocks). */
export function coerceHttpsUrl(url: string): string {
  if (!url.startsWith("http://")) return url;

  if (import.meta.env.DEV && typeof window !== "undefined" && window.location.protocol === "http:") {
    return url;
  }

  if (import.meta.env.PROD || (typeof window !== "undefined" && window.location.protocol === "https:")) {
    const upgraded = `https://${url.slice("http://".length)}`;
    if (import.meta.env.DEV) {
      console.warn("[api] Upgraded API URL from http to https:", upgraded);
    }
    return upgraded;
  }

  return url;
}

function warnIfApiPointsToViteDev(base: string) {
  if (!import.meta.env.DEV || !base || base.startsWith("/")) return;
  try {
    const u = new URL(base);
    if (u.port === "5173") {
      console.error(
        "[api] VITE_API_URL must point to FastAPI (e.g. :8010/api), not the Vite dev server (:5173). " +
          "Leave VITE_API_URL empty to use the dev proxy, or set https://<host>:8010/api and restart Vite."
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
    const apiHost = new URL(base).host;
    const pageHost = window.location.host;
    if (apiHost === pageHost) {
      console.error(
        "[api] VITE_API_URL must point to the Railway backend (e.g. https://your-app.up.railway.app/api), " +
          "not the frontend host. POST /api/* on the SPA host returns 405."
      );
    }
  } catch {
    /* ignore */
  }
}

function normalizeApiBaseFromEnv(value: string): string {
  let base = value.trim().replace(/\/+$/, "");
  if (!base) return "";
  if (base.startsWith("/")) return base;

  try {
    const u = new URL(base);
    if (u.pathname === "" || u.pathname === "/") {
      u.pathname = "/api";
      base = u.toString().replace(/\/+$/, "");
    }
  } catch {
    /* keep original value */
  }

  return coerceHttpsUrl(base);
}

export function getApiBaseUrl(): string {
  const v = import.meta.env.VITE_API_URL;
  const fromEnv = typeof v === "string" ? normalizeApiBaseFromEnv(v) : "";

  if (fromEnv) {
    warnIfApiPointsToViteDev(fromEnv);
    warnIfApiPointsToFrontendHost(fromEnv);
    return fromEnv;
  }

  return "/api";
}

/**
 * Absolute or root-relative URL for a path under the API prefix (e.g. ``auth/login`` → ``/api/auth/login``).
 * Matches Swagger: POST {base}/auth/login with JSON body.
 */
export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const segment = path.replace(/^\/+/, "");
  if (!base) return `/${segment}`;
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return `${base}/${segment}`;
  }
  return `${base}/${segment}`;
}

/**
 * Origin for resolving `/uploads/...` paths to absolute URLs in the browser.
 * With dev proxy, matches the Vite dev server (same origin as the app).
 */
export function getBackendPublicOrigin(): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  if (!base) return "";
  if (typeof window === "undefined") {
    try {
      return coerceHttpsUrl(new URL(base).origin);
    } catch {
      return "";
    }
  }
  try {
    return coerceHttpsUrl(new URL(base, window.location.origin).origin);
  } catch {
    return "";
  }
}

/**
 * Origin for `GET/POST /wms/photo-upload/...` (FastAPI mounts this outside `/api`).
 * In dev with `baseURL` `/api`, use the SPA origin so Vite proxies `/wms/photo-upload`.
 * With `VITE_API_URL=https://host/api`, use `https://host`.
 */
export function getWmsPhotoUploadOrigin(): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  if (!base || base === "/api") {
    return typeof window !== "undefined" ? window.location.origin : "";
  }
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const root = base.endsWith("/api") ? base.slice(0, -4) : base;
    return coerceHttpsUrl(root.replace(/\/+$/, ""));
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}
