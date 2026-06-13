/** P5.1 — consolidation plan status colors for WMS / OMS UI. */

export type ConsolidationPlanStatus =
  | "DRAFT"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export const CONSOLIDATION_PLAN_STATUS_LABELS: Record<ConsolidationPlanStatus, string> = {
  DRAFT: "Szkic",
  READY: "Gotowy",
  IN_PROGRESS: "W toku",
  COMPLETED: "Zakończony",
  CANCELLED: "Anulowany",
};

export const CONSOLIDATION_PLAN_STATUS_CLASS: Record<ConsolidationPlanStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-700",
  READY: "border-sky-200 bg-sky-50 text-sky-900",
  IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-950",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  CANCELLED: "border-red-200 bg-red-50 text-red-900",
};

export function consolidationPlanStatusLabel(status: string): string {
  const key = status.toUpperCase() as ConsolidationPlanStatus;
  return CONSOLIDATION_PLAN_STATUS_LABELS[key] ?? status;
}

export function consolidationPlanStatusClass(status: string): string {
  const key = status.toUpperCase() as ConsolidationPlanStatus;
  return CONSOLIDATION_PLAN_STATUS_CLASS[key] ?? "border-slate-200 bg-slate-50 text-slate-700";
}
