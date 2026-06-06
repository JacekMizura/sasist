/**
 * Safe string helpers — API values may be null/undefined during rollout.
 * Never call .trim() / .toLowerCase() directly on untrusted payloads.
 */

export function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function safeLower(value: unknown): string {
  return safeTrim(value).toLowerCase();
}

export function safeUpper(value: unknown): string {
  return safeTrim(value).toUpperCase();
}

export function safeIncludes(haystack: unknown, needle: unknown): boolean {
  const h = safeLower(haystack);
  const n = safeLower(needle);
  if (!h || !n) return false;
  return h.includes(n);
}

export function safeStartsWith(haystack: unknown, prefix: unknown): boolean {
  const h = safeLower(haystack);
  const p = safeLower(prefix);
  if (!p) return false;
  return h.startsWith(p);
}

/** Non-empty display string or fallback. */
export function safeDisplay(value: unknown, fallback = "—"): string {
  const s = safeTrim(value);
  return s || fallback;
}
