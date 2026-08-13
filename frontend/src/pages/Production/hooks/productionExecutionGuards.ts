import {
  formatStockShortagesSummary,
  parseInsufficientStockDetail,
} from "../productionUi";
import { formatApiError } from "../../../utils/apiErrorMessage";

/** Sync lock for in-flight mutations (React `busy` alone is not enough). */
export type MutationLockRef = { current: boolean };

const AXIOS_STATUS_RE = /^Request failed with status code \d+$/i;

/** Business message from FastAPI `{ detail }` / `{ message }`, or null. */
export function extractApiBusinessMessage(e: unknown): string | null {
  if (!e || typeof e !== "object" || !("response" in e)) return null;
  const data = (e as { response?: { data?: unknown } }).response?.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const detail = d.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const nested = detail as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim();
  }
  if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  return null;
}

/**
 * Polish operator-facing error for production terminal mutations.
 * Never surfaces raw axios status text.
 */
export function formatProductionMutationError(e: unknown, fallback: string): string {
  const insufficient = parseInsufficientStockDetail(e);
  if (insufficient) {
    const base = insufficient.message ?? "Niewystarczający stan magazynowy składników.";
    if (insufficient.shortages?.length) {
      return `${base} ${formatStockShortagesSummary(insufficient.shortages)}`;
    }
    return base;
  }
  const business = extractApiBusinessMessage(e);
  if (business) return business;
  if (e instanceof Error && e.message && !AXIOS_STATUS_RE.test(e.message)) {
    return e.message;
  }
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim() && !AXIOS_STATUS_RE.test(m)) return m.trim();
  }
  const raw = formatApiError(e);
  if (!raw || AXIOS_STATUS_RE.test(raw) || raw === "[object Object]") return fallback;
  return raw;
}

/** ORDERS MO finishes on FG buffer — no Rozlokowanie queue. */
export function ordersMoSkipsPutaway(sourceType?: string | null): boolean {
  return String(sourceType || "").toUpperCase() === "ORDERS";
}

/**
 * Run one mutation under a synchronous lock. Returns `undefined` if already locked
 * (second click / scan ignored). Always releases lock in `finally`.
 */
export async function withMutationLock<T>(
  lock: MutationLockRef,
  setBusy: (busy: boolean) => void,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  setBusy(true);
  try {
    return await fn();
  } finally {
    lock.current = false;
    setBusy(false);
  }
}
