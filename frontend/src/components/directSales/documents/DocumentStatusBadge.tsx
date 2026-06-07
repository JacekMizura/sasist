import { documentStatusPl, fiscalStatusPl } from "../directSalesTerminology";

type Props = {
  status: string | null | undefined;
  statusLabel?: string | null;
  fiscalStatus?: string | null;
};

function badgeClass(status: string): string {
  const s = status.toUpperCase();
  // Zaktualizowano na pastelowe odcienie z obwódką
  if (s === "GENERATED" || s === "COMPLETED" || s === "DONE") 
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (s === "PROCESSING") 
    return "bg-blue-50 text-blue-700 border border-blue-200";
  if (s === "PENDING" || s === "RETRYING") 
    return "bg-amber-50 text-amber-700 border border-amber-200";
  if (s === "FAILED" || s === "CANCELLED") 
    return "bg-red-50 text-red-700 border border-red-200";
  return "bg-slate-50 text-slate-600 border border-slate-200";
}

export function DocumentStatusBadge({ status, statusLabel, fiscalStatus }: Props) {
  const label = statusLabel ?? documentStatusPl(status);
  
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${badgeClass(String(status ?? ""))}`}>
        {label}
      </span>
      
      {fiscalStatus ? (
        <span className="rounded-lg bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          {fiscalStatusPl(fiscalStatus)}
        </span>
      ) : null}
    </div>
  );
}