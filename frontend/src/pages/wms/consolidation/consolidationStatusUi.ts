/** P5.2 — consolidation plan / item status labels for WMS / OMS UI. */

export type ConsolidationPlanStatus =
  | "DRAFT"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "EXCEPTION"
  | "MANUAL_REVIEW_REQUIRED";

export const CONSOLIDATION_PLAN_STATUS_LABELS: Record<ConsolidationPlanStatus, string> = {
  DRAFT: "Szkic",
  READY: "Gotowy",
  IN_PROGRESS: "W toku",
  COMPLETED: "Zakończony",
  CANCELLED: "Anulowany",
  EXCEPTION: "Wyjątek",
  MANUAL_REVIEW_REQUIRED: "Wymaga decyzji",
};

export const CONSOLIDATION_PLAN_STATUS_CLASS: Record<ConsolidationPlanStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-100 text-slate-700",
  READY: "border-sky-200 bg-sky-50 text-sky-900",
  IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-950",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  CANCELLED: "border-red-200 bg-red-50 text-red-900",
  EXCEPTION: "border-orange-200 bg-orange-50 text-orange-950",
  MANUAL_REVIEW_REQUIRED: "border-violet-200 bg-violet-50 text-violet-950",
};

export function consolidationPlanStatusLabel(status: string): string {
  const key = status.toUpperCase() as ConsolidationPlanStatus;
  return CONSOLIDATION_PLAN_STATUS_LABELS[key] ?? status;
}

export function consolidationPlanStatusClass(status: string): string {
  const key = status.toUpperCase() as ConsolidationPlanStatus;
  return CONSOLIDATION_PLAN_STATUS_CLASS[key] ?? "border-slate-200 bg-slate-50 text-slate-700";
}

export const ALERT_SEVERITY_CLASS: Record<string, string> = {
  INFO: "border-slate-200 bg-slate-50 text-slate-700",
  WARNING: "border-amber-200 bg-amber-50 text-amber-950",
  CRITICAL: "border-red-200 bg-red-50 text-red-900",
};

export function alertSeverityLabel(severity: string): string {
  const s = severity.toUpperCase();
  if (s === "CRITICAL") return "Krytyczny";
  if (s === "WARNING") return "Ostrzeżenie";
  return "Info";
}
