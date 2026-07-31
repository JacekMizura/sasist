export type WmsSidebarTimeCell = { title: string; value: string; statusChip: string };

export function WmsOperationTimesKpiPanel({ cells }: { cells: readonly WmsSidebarTimeCell[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Czasy operacji (WMS)</h3>
      <div className="grid grid-cols-2 gap-2">
        {cells.map((cell) => (
          <div
            key={cell.title}
            className="flex min-h-[4.5rem] flex-col justify-between rounded-md border border-slate-200 bg-slate-50/50 p-2.5"
          >
            <p className="text-[10px] leading-snug text-slate-500">{cell.title}</p>
            <div>
              <p className="text-lg font-black tabular-nums text-slate-900">{cell.value}</p>
              <span className="mt-0.5 inline-flex rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                {cell.statusChip}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
