/**
 * Format a dimension in mm for display (e.g. in template list).
 * Returns rounded integer; does not modify stored values.
 */
export function formatMm(value: number | undefined | null): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.round(value);
}
