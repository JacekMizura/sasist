export function formatDm3(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} mln dm³`;
  if (v >= 1000) return `${(v / 1000).toFixed(2)} tys. dm³`;
  return `${Math.round(v)} dm³`;
}

export function formatPln(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(v);
}
