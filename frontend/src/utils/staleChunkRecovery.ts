/**
 * Stale Vite/SPA chunk recovery after deploy.
 *
 * Scenario: client holds main bundle from deployment A, navigates to a lazy route
 * whose chunk hash was removed in deployment B. Vercel often serves index.html
 * (text/html) for the missing asset → dynamic import throws.
 */

const RELOAD_FLAG_KEY = "sasist:stale-chunk-reload";

const STALE_CHUNK_MESSAGE_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed|ChunkLoadError/i;

export function isStaleChunkError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = String((error as { name?: unknown }).name ?? "");
    if (name === "ChunkLoadError") return true;
  }
  const msg =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : String(error);
  return STALE_CHUNK_MESSAGE_RE.test(msg);
}

/** True if this tab already consumed the one-shot reload (prevents loops). */
export function hasStaleChunkReloadBeenAttempted(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG_KEY) === "1";
  } catch {
    return true;
  }
}

function markStaleChunkReloadAttempted(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** Clear flag after a successful boot so a later deploy can recover again. */
export function clearStaleChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * At most one full-page reload per tab session for stale chunks.
 * @returns true if reload was triggered (caller should stop rendering).
 */
export function tryStaleChunkReload(): boolean {
  if (!isBrowser()) return false;
  if (hasStaleChunkReloadBeenAttempted()) return false;
  markStaleChunkReloadAttempted();
  window.location.reload();
  return true;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function recoverFromStaleChunkError(error: unknown): boolean {
  if (!isStaleChunkError(error)) return false;
  return tryStaleChunkReload();
}
