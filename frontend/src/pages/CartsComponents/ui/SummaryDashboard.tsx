import { CubeIcon } from "./Icons";
import { useTranslation } from "../../../locales";

/** Panel podsumowania: suma jednostek, w użyciu, dostępne, łączna pojemność, globalne zapełnienie. */

type Summary = {
  totalUnits: number;
  inUse: number;
  available: number;
  totalVolume: number;
  totalUsedVolume?: number;
};

type SummaryDashboardProps = {
  summary: Summary;
};

export default function SummaryDashboard({ summary }: SummaryDashboardProps) {
  const t = useTranslation();
  const totalCapacity = summary.totalVolume || 1;
  const globalFillPercent =
    typeof summary.totalUsedVolume === "number"
      ? Math.min(100, Math.round((summary.totalUsedVolume / totalCapacity) * 100))
      : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.totalUnits}</div>
          <div className="text-2xl font-black text-slate-800 mt-1">{summary.totalUnits}</div>
        </div>
        <div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.inUse}</div>
          <div className="text-2xl font-black text-blue-600 mt-1">{summary.inUse}</div>
        </div>
        <div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.available}</div>
          <div className="text-2xl font-black text-green-600 mt-1">{summary.available}</div>
        </div>
        <div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <CubeIcon className="w-4 h-4 text-slate-300" />
            {t.totalVolume}
          </div>
          <div className="text-2xl font-black text-slate-800 mt-1">
            {summary.totalVolume.toFixed(1)} <span className="text-sm font-black text-slate-400 uppercase">dm³</span>
          </div>
        </div>
      </div>
      {typeof summary.totalUsedVolume === "number" && (
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
            {t.simulation_global_fill}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  globalFillPercent >= 96 ? "bg-red-500" : globalFillPercent >= 81 ? "bg-orange-500" : "bg-blue-600"
                }`}
                style={{ width: `${globalFillPercent}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-slate-400">{globalFillPercent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

