type Props = {
  status: string | null | undefined;
  statusLabel?: string | null;
  fiscalStatus?: string | null;
};

function badgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "GENERATED" || s === "COMPLETED" || s === "DONE") return "bg-emerald-100 text-emerald-800";
  if (s === "PROCESSING") return "bg-sky-100 text-sky-800";
  if (s === "PENDING" || s === "RETRYING") return "bg-amber-100 text-amber-900";
  if (s === "FAILED" || s === "CANCELLED") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

export function DocumentStatusBadge({ status, statusLabel, fiscalStatus }: Props) {
  const label = statusLabel ?? status ?? "—";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass(String(status ?? ""))}`}>
        {label}
      </span>
      {fiscalStatus ? (
        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-800">
          {fiscalStatus === "PENDING" ? "Oczekuje na fiskalizację" : fiscalStatus}
        </span>
      ) : null}
    </div>
  );
}
