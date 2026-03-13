import type { LayoutState } from "../../../types/warehouse";

export interface MagazynDashboardPanelProps {
  layout: LayoutState;
  summaryByTemplate: {
    templateName: string;
    totalRacks: number;
    color: string;
  }[];
  productsAssignedVolumeDm3: number;
  totalCapacity: number;
  utilizationPct: number;
  formatVolume: (n: number) => string;
}

export function MagazynDashboardPanel({
  layout,
  summaryByTemplate,
  productsAssignedVolumeDm3,
  totalCapacity,
  utilizationPct,
  formatVolume,
}: MagazynDashboardPanelProps) {
  return (
    <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-black uppercase text-slate-500 mb-3">Pulpit magazynu</h2>
      <div className="space-y-3">
        <div className="flex justify-between items-baseline">
          <span className="text-slate-600 text-sm">Liczba regałów</span>
          <span className="font-mono font-bold text-[#1E293B]">{layout.racks.length}</span>
        </div>
        <div className="border-t border-slate-100 pt-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1.5">Regały wg typu</p>
          <ul className="space-y-1">
            {summaryByTemplate.map(({ templateName, totalRacks, color }) => (
              <li key={templateName} className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-slate-700 truncate">{templateName}</span>
                </span>
                <span className="font-mono font-semibold text-slate-800">{totalRacks}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-slate-100 pt-2">
          <div className="flex justify-between items-baseline text-sm">
            <span className="text-slate-600">Zajętość (dm³)</span>
            <span className="font-mono font-semibold text-[#1E293B]">{formatVolume(productsAssignedVolumeDm3)} / {formatVolume(totalCapacity)}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${utilizationPct <= 50 ? "bg-emerald-500" : utilizationPct <= 80 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(100, utilizationPct)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Wykorzystanie: <span className="font-mono font-semibold text-slate-700">{utilizationPct.toFixed(1)}%</span></p>
        </div>
      </div>
    </div>
  );
}
