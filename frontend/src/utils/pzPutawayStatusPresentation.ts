/** WMS PZ putaway workflow: NOT_STARTED | IN_PROGRESS | DONE */

function normalizePutawayStatusKey(status: string | undefined): string {
  return (status || "NOT_STARTED")
    .toUpperCase()
    .trim()
    .replace(/-/g, "_");
}

export function pzPutawayStatusLabelPl(status: string | undefined): string {
  const s = normalizePutawayStatusKey(status);
  if (s === "NOT_STARTED") return "Przyjęto / Czeka na rozlokowanie PZ";
  if (s === "IN_PROGRESS") return "W trakcie rozlokowania PZ";
  if (s === "DONE") return "Rozlokowano";
  return (status || "").trim() || "—";
}

export function pzPutawayStatusBadgeClass(status: string | undefined): string {
  const s = normalizePutawayStatusKey(status);
  if (s === "NOT_STARTED") return "bg-slate-100 text-slate-800 ring-1 ring-slate-200/90";
  if (s === "IN_PROGRESS") return "bg-amber-100 text-amber-900 ring-1 ring-amber-200/90";
  if (s === "DONE") return "bg-green-100 text-green-800 ring-1 ring-green-200/90";
  return "bg-slate-100 text-slate-800 ring-1 ring-slate-200/90";
}
