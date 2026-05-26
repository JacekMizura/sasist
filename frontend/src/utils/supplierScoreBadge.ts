/** Compact label + badge style from numeric score (Purchasing supplier analytics). */
export function supplierScoreTier(score: number | null | undefined): {
  label: string;
  badgeClass: string;
} {
  if (score == null || !Number.isFinite(Number(score))) {
    return { label: "—", badgeClass: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" };
  }
  const s = Number(score);
  if (s >= 95) return { label: `${Math.round(s)} A+`, badgeClass: "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300" };
  if (s >= 82) return { label: `${Math.round(s)} A`, badgeClass: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" };
  if (s >= 71) return { label: `${Math.round(s)} B`, badgeClass: "bg-sky-50 text-sky-950 ring-1 ring-sky-200" };
  if (s >= 58) return { label: `${Math.round(s)} C`, badgeClass: "bg-amber-50 text-amber-950 ring-1 ring-amber-200" };
  if (s >= 40) return { label: `${Math.round(s)} Ryzyko`, badgeClass: "bg-orange-50 text-orange-950 ring-1 ring-orange-200" };
  return { label: `${Math.round(s)} Ryzyko`, badgeClass: "bg-rose-100 text-rose-950 ring-1 ring-rose-300" };
}
