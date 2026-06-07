/**
 * Order / WMS / ERP money helpers — display amounts with exactly 2 fraction digits.
 */

export function roundMoney2(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;
}

/** Canonical Polish retail display: `5,00 zł` (comma, 2 decimals, NBSP before zł). */
export function formatMoneyPl(
  value: number | null | undefined,
  options?: { currency?: string },
): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = roundMoney2(Number(value));
  const formatted = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  const cur = (options?.currency ?? "zł").trim() || "zł";
  return `${formatted}\u00a0${cur}`;
}

export function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const cur = (currency && currency.trim()) || "PLN";
  if (cur === "PLN" || cur === "zł") {
    return formatMoneyPl(value, { currency: "zł" });
  }
  const n = roundMoney2(Number(value));
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return formatMoneyPl(n, { currency: cur });
  }
}

/** Wartość do pól edycyjnych (kropka dziesiętna). */
export function moneyInputStringFromNumber(n: number): string {
  return roundMoney2(n).toFixed(2);
}
