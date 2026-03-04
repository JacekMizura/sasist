import { useEffect } from "react";
import { useTranslation } from "../../../locales";
import ProgressBar from "./ProgressBar";

/** Modal wyniku symulacji przypisania: przypisane/nieprzypisane zamówienia, wykorzystanie wózka (%). */

type SimulationResultModalProps = {
  open: boolean;
  assignedCount: number;
  unassignedCount: number;
  utilizationPercent: number;
  onClose: () => void;
};

export default function SimulationResultModal({
  open,
  assignedCount,
  unassignedCount,
  utilizationPercent,
  onClose,
}: SimulationResultModalProps) {
  const t = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <span className="font-black text-slate-800 uppercase text-xs tracking-widest">
            {t.simulation_modal_title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black flex items-center justify-center"
            aria-label={t.close}
          >
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <span className="text-[10px] font-black uppercase tracking-widest">
              {t.simulation_assign_success}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {t.simulation_assigned_count}
              </div>
              <div className="text-2xl font-black text-slate-800 mt-1">{assignedCount}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {t.simulation_unassigned_count}
              </div>
              <div className="text-2xl font-black text-slate-800 mt-1">{unassignedCount}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              {t.simulation_utilization}
            </div>
            <ProgressBar percent={utilizationPercent} />
          </div>
        </div>
      </div>
    </div>
  );
}
