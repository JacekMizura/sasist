/**
 * Order / WMS / ERP money helpers — display amounts with exactly 2 fraction digits.
 */

export function roundMoney2(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;
}

export function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const cur = (currency && currency.trim()) || "PLN";
  const n = roundMoney2(Number(value));
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

/** Wartość do pól edycyjnych (kropka dziesiętna). */
export function moneyInputStringFromNumber(n: number): string {
  return roundMoney2(n).toFixed(2);
}
