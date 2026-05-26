import type { BusinessDocStatus } from "./warehouseDocumentsUi";
import { businessStatusBadgeClass, normalizeWarehouseDocType, warehouseDocTypeBadgeLabel } from "./warehouseDocumentsUi";

const pill = "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 sm:text-sm";

/** Payment badge — green paid, gray unpaid / unknown. */
export function PaymentStatusBadge({ paid }: { paid?: boolean | null }) {
  if (paid === true) {
    return (
      <span className={`${pill} bg-emerald-50 text-emerald-800 ring-emerald-200/90`}>Opłacone</span>
    );
  }
  return <span className={`${pill} bg-slate-100 text-slate-600 ring-slate-200/90`}>Nieopłacone</span>;
}

/** Neutral badge for warehouse / not applicable. */
export function PaymentNotApplicableBadge() {
  return <span className={`${pill} bg-slate-100 text-slate-500 ring-slate-200/90`}>N/D</span>;
}

export function ExternalStatusBadge({ status }: { status: BusinessDocStatus }) {
  return (
    <span className={`${pill} uppercase tracking-wide ${businessStatusBadgeClass(status)}`}>{status}</span>
  );
}

/** Sales-style document type (FV, PA, Korekta) — extended palette for mag types too. */
export function DocumentTypeBadge({ code }: { code: string }) {
  const u = code.trim().toUpperCase();
  const mag = ["PZ", "WZ", "MM", "RW", "INV"];
  const norm = mag.includes(u) ? normalizeWarehouseDocType(u) : null;
  const label = norm ? warehouseDocTypeBadgeLabel(norm) : u.slice(0, 8);
  let cls = "bg-slate-100 text-slate-800 ring-slate-200/90";
  if (u === "FV" || u === "FAKTURA") cls = "bg-violet-100 text-violet-900 ring-violet-200/90";
  else if (u === "PA" || u === "PARAGON") cls = "bg-sky-100 text-sky-900 ring-sky-200/90";
  else if (u.includes("KOR") || u === "KOREKTA") cls = "bg-amber-100 text-amber-950 ring-amber-200/90";
  else if (u === "PZ") cls = "bg-sky-100 text-sky-900 ring-sky-200/90";
  else if (u === "WZ") cls = "bg-violet-100 text-violet-900 ring-violet-200/90";
  else if (u === "MM") cls = "bg-cyan-100 text-cyan-900 ring-cyan-200/90";
  else if (u === "RW") cls = "bg-orange-100 text-orange-900 ring-orange-200/90";
  else if (u === "INV") cls = "bg-indigo-100 text-indigo-900 ring-indigo-200/90";
  return <span className={`${pill} font-bold uppercase tracking-wide ${cls}`}>{label}</span>;
}
