/**
 * Axios `baseURL` = `import.meta.env.VITE_API_URL` (normalized, HTTPS-only in prod).
 * Dev: empty env → relative `/api` (Vite proxy).
 */

const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Never expose `http://` to the browser for public/production API hosts. */
export function coerceHttpsUrl(url: string): string {
  if (!url.startsWith("http://")) return url;

  try {
    const host = new URL(url).hostname.toLowerCase();
    const isLocal = LOCAL_API_HOSTS.has(host) || host.endsWith(".local");
    if (import.meta.env.DEV && isLocal && typeof window !== "undefined" && window.location.protocol === "http:") {
      return url;
    }
  } catch {
    /* upgrade below */
  }

  return `https://${url.slice("http://".length)}`;
}

function warnIfApiPointsToViteDev(base: string) {
  if (!import.meta.env.DEV || !base || base.startsWith("/")) return;
  try {
    const u = new URL(base);
    if (u.port === "5173") {
      console.error(
        "[api] VITE_API_URL must point to FastAPI (e.g. :8010/api), not the Vite dev server (:5173). " +
          "Leave VITE_API_URL empty to use the dev proxy."
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
      console.error(
        "[api] VITE_API_URL must point to the backend (e.g. https://your-app.up.railway.app/api), not the SPA host."
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
    /* keep */
  }

  return coerceHttpsUrl(base);
}

/**
 * Single source for axios `baseURL` (from `VITE_API_URL`, no http fallbacks in production).
 */
export function resolveAxiosBaseURL(): string {
  const raw = import.meta.env.VITE_API_URL;
  const fromEnv = typeof raw === "string" ? normalizeApiBaseFromEnv(raw) : "";

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

export function buildApiUrl(path: string): string {
  const base = resolveAxiosBaseURL().replace(/\/+$/, "");
  const segment = path.replace(/^\/+/, "");
  return `${base}/${segment}`;
}

export function getBackendPublicOrigin(): string {
  const base = resolveAxiosBaseURL().replace(/\/+$/, "");
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

export function getWmsPhotoUploadOrigin(): string {
  const base = resolveAxiosBaseURL().replace(/\/+$/, "");
  if (!base || base === "/api") {
    return typeof window !== "undefined" ? window.location.origin : "";
  }
  if (base.startsWith("http://") || base.startsWith("https://")) {
    const root = base.endsWith("/api") ? base.slice(0, -4) : base;
    return coerceHttpsUrl(root.replace(/\/+$/, ""));
  }
  return typeof window !== "undefined" ? window.location.origin : "";
}
