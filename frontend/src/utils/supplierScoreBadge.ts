/** Klasy badge punktacji dostawcy (0–100) — spójne z rankingiem i zamówieniami towaru. */
export function supplierScoreBadgeClass(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(Number(score))) {
    return "bg-slate-100 text-slate-600 ring-slate-200";
  }
  const s = Number(score);
  if (s >= 90) return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (s >= 70) return "bg-sky-100 text-sky-900 ring-sky-200";
  if (s >= 50) return "bg-amber-100 text-amber-950 ring-amber-200";
  return "bg-red-100 text-red-900 ring-red-200";
}

/** Etykieta + badge z liczbową punktacją (lub „—” gdy brak danych). */
export function supplierScoreTier(score: number | null | undefined): {
  label: string;
  badgeClass: string;
} {
  if (score == null || !Number.isFinite(Number(score))) {
    return { label: "—", badgeClass: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" };
  }
  const s = Math.round(Number(score));
  return {
    label: String(s),
    badgeClass: `ring-1 ${supplierScoreBadgeClass(score)}`,
  };
}
