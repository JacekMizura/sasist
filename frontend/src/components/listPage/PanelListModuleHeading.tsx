/**
 * Shared list title + result count (Orders / Returns / Complaints dense lists).
 */
export function PanelListModuleHeading({
  title,
  resultCountLabel,
  loading,
}: {
  title: string;
  resultCountLabel: string;
  loading: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h1>
      {!loading ? <span className="text-[13px] font-medium tabular-nums text-slate-500">{resultCountLabel}</span> : null}
    </div>
  );
}
