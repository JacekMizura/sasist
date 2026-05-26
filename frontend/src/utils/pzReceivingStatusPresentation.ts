/**
 * WMS PZ counting progress — backend stores pending | in_progress | received.
 * Optional synonyms (e.g. NEW / COMPLETED) accepted for robustness.
 */

function normalizeReceivingStatusKey(status: string | undefined): string {
  return (status || "pending")
    .toLowerCase()
    .trim()
    .replace(/-/g, "_");
}

/** Polish label for chips and lists. */
export function pzReceivingStatusLabelPl(status: string | undefined): string {
  const s = normalizeReceivingStatusKey(status);
  if (s === "pending" || s === "new") return "Nowe";
  if (s === "in_progress") return "W trakcie";
  if (s === "received" || s === "completed" || s === "done") return "Zakończone";
  return (status || "").trim() || "—";
}

export function pzReceivingStatusBadgeClass(status: string | undefined): string {
  const s = normalizeReceivingStatusKey(status);
  if (s === "pending" || s === "new") return "bg-blue-100 text-blue-700 ring-1 ring-blue-200/90";
  if (s === "in_progress") return "bg-amber-100 text-amber-900 ring-1 ring-amber-200/90";
  if (s === "received" || s === "completed" || s === "done")
    return "bg-green-100 text-green-700 ring-1 ring-green-200/90";
  return "bg-slate-100 text-slate-800 ring-1 ring-slate-200/90";
}
