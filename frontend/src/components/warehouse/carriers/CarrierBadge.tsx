type Props = {
  code: string;
  showMix?: boolean;
  className?: string;
};

/** Badge nośnika — prosty styl tabelaryczny (jak kody w ERP). */
export function CarrierBadge({ code, showMix, className = "" }: Props) {
  const c = (code || "").trim() || "—";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 font-mono text-[12px] font-semibold text-slate-800 ${className}`}
      title={c}
    >
      <span className="min-w-0 truncate">{c}</span>
      {showMix ? (
        <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1 text-[10px] font-semibold uppercase text-slate-600">
          MIX
        </span>
      ) : null}
    </span>
  );
}
