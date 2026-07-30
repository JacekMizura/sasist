export type WmsSidebarTimeCell = { title: string; value: string; statusChip: string };

export function WmsOperationTimesKpiPanel({ cells }: { cells: readonly WmsSidebarTimeCell[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-5">Czasy operacji (WMS)</h3>
      <div className="grid grid-cols-2 gap-4">
        {cells.map((cell) => (
          <div key={cell.title} className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 flex flex-col justify-between">
            <p className="text-xs text-slate-500 mb-2">{cell.title}</p>
            <div>
              <p className="text-2xl font-black text-slate-900">{cell.value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{cell.statusChip}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
