/** P2.5A — warehouse + purchase workflow statuses (independent axes). */

export const WAREHOUSE_WORKFLOW_STATUSES = [
  "NEW",
  "COUNTING",
  "COUNTED",
  "PUTAWAY_IN_PROGRESS",
  "PUTAWAY_COMPLETED",
  "CLOSED",
] as const;

export const PURCHASE_WORKFLOW_STATUSES = [
  "PENDING_INVOICE",
  "COST_REVIEW",
  "COST_DISPUTE",
  "VERIFIED",
] as const;

export type WarehouseWorkflowStatus = (typeof WAREHOUSE_WORKFLOW_STATUSES)[number];
export type PurchaseWorkflowStatus = (typeof PURCHASE_WORKFLOW_STATUSES)[number];

function norm(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
}

/** Legacy receiving_status → warehouse workflow (fallback when API field missing). */
export function legacyReceivingToWarehouseStatus(receivingStatus: string | undefined): WarehouseWorkflowStatus {
  const s = norm(receivingStatus);
  if (s === "IN_PROGRESS") return "COUNTING";
  if (s === "DONE") return "COUNTED";
  if (s === "NEW" || s === "PENDING") return "NEW";
  return "NEW";
}

export function resolveWarehouseWorkflowStatus(
  warehouseWorkflowStatus: string | undefined,
  fallback?: { receiving_status?: string; putaway_status?: string; relocation_status?: string; status?: string },
): WarehouseWorkflowStatus {
  const direct = norm(warehouseWorkflowStatus);
  if (WAREHOUSE_WORKFLOW_STATUSES.includes(direct as WarehouseWorkflowStatus)) {
    return direct as WarehouseWorkflowStatus;
  }
  if (fallback) {
    const st = norm(fallback.status);
    if (st === "ZAKONCZONE" || st === "POSTED" || st === "CLOSED") return "CLOSED";
    const rs = norm(fallback.receiving_status);
    const ps = norm(fallback.putaway_status);
    const rls = norm(fallback.relocation_status);
    if (rls === "DONE") return "PUTAWAY_COMPLETED";
    if (ps === "IN_PROGRESS") return "PUTAWAY_IN_PROGRESS";
    if (rs === "DONE") return "COUNTED";
    if (rs === "IN_PROGRESS") return "COUNTING";
  }
  return legacyReceivingToWarehouseStatus(fallback?.receiving_status);
}

export function warehouseWorkflowStatusLabelPl(status: string | undefined): string {
  const s = norm(status);
  switch (s) {
    case "NEW":
      return "Nowe";
    case "COUNTING":
      return "W trakcie przyjęcia";
    case "COUNTED":
      return "Oczekuje na rozlokowanie";
    case "PUTAWAY_IN_PROGRESS":
      return "Rozlokowanie";
    case "PUTAWAY_COMPLETED":
      return "Rozlokowane";
    case "CLOSED":
      return "Zamknięte";
    default:
      return (status || "").trim() || "—";
  }
}

export function warehouseWorkflowStatusBadgeClass(status: string | undefined): string {
  const s = norm(status);
  switch (s) {
    case "NEW":
      return "bg-blue-50 text-blue-800 ring-blue-200/90";
    case "COUNTING":
      return "bg-amber-50 text-amber-900 ring-amber-200/90";
    case "COUNTED":
      return "bg-sky-50 text-sky-900 ring-sky-200/90";
    case "PUTAWAY_IN_PROGRESS":
      return "bg-violet-50 text-violet-900 ring-violet-200/90";
    case "PUTAWAY_COMPLETED":
      return "bg-teal-50 text-teal-900 ring-teal-200/90";
    case "CLOSED":
      return "bg-slate-100 text-slate-700 ring-slate-200/90";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200/90";
  }
}

export function purchaseWorkflowStatusLabelPl(status: string | undefined): string {
  const s = norm(status);
  switch (s) {
    case "PENDING_INVOICE":
      return "Oczekuje FV";
    case "COST_REVIEW":
      return "Weryf. kosztów";
    case "COST_DISPUTE":
      return "Spór kosztowy";
    case "VERIFIED":
      return "Zweryfikowane";
    default:
      return (status || "").trim() || "—";
  }
}

export function purchaseWorkflowStatusBadgeClass(status: string | undefined): string {
  const s = norm(status);
  switch (s) {
    case "PENDING_INVOICE":
      return "bg-slate-50 text-slate-700 ring-slate-200/90";
    case "COST_REVIEW":
      return "bg-amber-50 text-amber-900 ring-amber-200/90";
    case "COST_DISPUTE":
      return "bg-rose-50 text-rose-900 ring-rose-200/90";
    case "VERIFIED":
      return "bg-emerald-50 text-emerald-900 ring-emerald-200/90";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200/90";
  }
}

export function showPurchaseWorkflowStatus(documentType: string | undefined): boolean {
  const dt = norm(documentType);
  return dt === "PZ";
}
