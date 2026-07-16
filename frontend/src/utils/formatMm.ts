/**
 * Format a dimension in mm for UI display.
 * Rounds to at most 1 decimal place; integers stay without trailing `.0`.
 * Does not modify stored values.
 */
export function formatMm(value: number | undefined | null): string {
  if (value == null || Number.isNaN(Number(value))) return "0";
  const rounded = Math.round(Number(value) * 10) / 10;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1);
}

/** e.g. „93 × 67 mm” */
export function formatLabelSizeMm(
  widthMm: number | undefined | null,
  heightMm: number | undefined | null,
): string {
  return `${formatMm(widthMm)} × ${formatMm(heightMm)} mm`;
}
