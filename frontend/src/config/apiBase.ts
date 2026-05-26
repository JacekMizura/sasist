/**
 * FastAPI axios `baseURL` must include the **`/api` path**, e.g.:
 * - Dev (recommended): relative `/api` — Vite proxies to the backend (LAN + HTTPS safe).
 * - Explicit: `http://192.168.x.x:8010/api` — only if the page is also served over HTTP, or
 *   you accept mixed-content rules in the browser.
 *
 * Static files: `/uploads/...` — use same host as the page when using the dev proxy.
 */

function warnIfApiPointsToViteDev(base: string) {
  if (!import.meta.env.DEV || !base || base.startsWith("/")) return;
  try {
    const u = new URL(base);
    if (u.port === "5173") {
      console.error(
        "[api] VITE_API_URL must point to FastAPI (e.g. :8010/api), not the Vite dev server (:5173). " +
          "Leave VITE_API_URL empty to use the dev proxy, or set http://<host>:8010/api and restart Vite."
      );
    }
  } catch {
    /* ignore */
  }
}

function normalizeApiBaseFromEnv(value: string): string {
  const base = value.trim().replace(/\/+$/, "");
  if (!base) return "";
  if (base.startsWith("/")) return base;

  try {
    const u = new URL(base);
    if (u.pathname === "" || u.pathname === "/") {
      u.pathname = "/api";
      return u.toString().replace(/\/+$/, "");
    }
  } catch {
    /* keep original value */
  }

  return base;
}

export function getApiBaseUrl(): string {
  const v = import.meta.env.VITE_API_URL;
  const fromEnv = typeof v === "string" ? normalizeApiBaseFromEnv(v) : "";

  if (fromEnv) {
    warnIfApiPointsToViteDev(fromEnv);
    return fromEnv;
  }

  if (import.meta.env.DEV) {
    return "/api";
  }

  return "";
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
      return new URL(base).origin;
    } catch {
      return "";
    }
  }
  try {
    return new URL(base, window.location.origin).origin;
  } catch {
    return "";
  }
}

/**
 * Origin for `GET/POST /wms/photo-upload/...` (FastAPI mounts this outside `/api`).
 * In dev with `baseURL` `/api`, use the SPA origin so Vite proxies `/wms/photo-upload`.
 * With `VITE_API_URL=http://host:8010/api`, use `http://host:8010`.
 */
export function getWmsPhotoUploadOrigin(): string {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  if (!base) {
    return typeof window !== "undefined" ? window.location.origin : "";
  }
  if (base === "/api") {
    return typeof window !== "undefined" ? window.location.origin : "";
  }
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const root = base.endsWith("/api") ? base.slice(0, -4) : base;
    return root.replace(/\/+$/, "");
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}
