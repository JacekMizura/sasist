/** Money / PL display helpers for Warehouse Materials (cartons, packaging, tiers). */

export function roundWmMoney2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Parse currency-like input; empty → null. */
export function parseWmMoneyToNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  const n = parseFloat(t.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n;
}

/** For API payloads: null if empty/invalid; else non‑negative value rounded to 2 decimals. */
export function parseMoneyToOptionalRounded(s: string): number | null {
  const n = parseWmMoneyToNumber(s);
  if (n == null || n < 0) return null;
  return roundWmMoney2(n);
}

/**
 * Editable string from API number: max 2 decimals, comma decimal separator, trim trailing zeros.
 */
export function numberToEditableMoneyString(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const r = roundWmMoney2(n);
  const neg = r < 0;
  const a = Math.abs(r);
  const s = a.toFixed(2);
  const [ip, fc] = s.split(".");
  const fcTrim = fc.replace(/0+$/, "");
  const body = fcTrim ? `${ip},${fcTrim}` : ip;
  return neg ? `-${body}` : body;
}

/** After blur: round to grosze, Polish comma. */
export function normalizeWmMoneyInputString(s: string): string {
  const n = parseWmMoneyToNumber(s);
  if (n == null) return "";
  return numberToEditableMoneyString(n);
}

/** Read-only label: e.g. 12 zł, 12,5 zł, 1250,99 zł — never more than 2 fractional digits. */
export function formatWmMoneyZloty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${numberToEditableMoneyString(n)} zł`;
}

/** Amount only (no currency suffix), for table cells. */
export function formatWmMoneyAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return numberToEditableMoneyString(n);
}

/** Optional package / tier quantity: unset or non-positive → null (for API). */
export function parseOptionalPositiveQuantity(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Blur: positive qty as normalized decimal string (2 dp max); empty stays empty. */
export function normalizeWmQuantityInputString(s: string): string {
  const n = parseOptionalPositiveQuantity(s);
  if (n == null) return "";
  const r = roundWmMoney2(n);
  return Number.isInteger(r) ? String(Math.trunc(r)) : numberToEditableMoneyString(r);
}
