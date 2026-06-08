/** Dense ERP inventory table styling. */
export const ERP_INV = {
  table: "min-w-full text-xs",
  th: "px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200",
  td: "px-2 py-1.5 align-middle border-b border-slate-100",
  row: "hover:bg-slate-50/80",
  badge: "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
  section: "rounded-lg border border-slate-200 bg-white shadow-sm",
  sectionHead: "border-b border-slate-200 px-3 py-2",
  kpi: "rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm",
} as const;

export const LINE_STATUS_LABELS: Record<string, string> = {
  open: "Otwarta",
  in_progress: "Liczenie",
  counted: "Policzona",
  recount: "Recount",
  approved: "Zatwierdzona",
  skipped: "Pominięta",
};

export const DIFF_CLASS_LABELS: Record<string, string> = {
  none: "OK",
  auto_approve: "OK",
  supervisor_review: "Różnica",
  mandatory_recount: "Recount",
};

export function lineStatusBadgeClass(status: string, diffQty: number | null | undefined): string {
  if (status === "recount") return "bg-orange-100 text-orange-800 ring-1 ring-orange-200";
  if (diffQty != null && Math.abs(diffQty) > 1e-9) return "bg-red-100 text-red-800 ring-1 ring-red-200";
  if (status === "counted" || status === "approved") return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200";
  return "bg-blue-100 text-blue-800 ring-1 ring-blue-200";
}

export function locationBadgeClass(status: string, diffQty: number | null | undefined): string {
  if (status === "recount") return "bg-orange-50 text-orange-800 ring-1 ring-orange-200";
  if (diffQty != null && Math.abs(diffQty) > 1e-9) return "bg-red-50 text-red-800 ring-1 ring-red-200";
  if (status === "counted" || status === "approved") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
  return "bg-blue-50 text-blue-800 ring-1 ring-blue-200";
}
