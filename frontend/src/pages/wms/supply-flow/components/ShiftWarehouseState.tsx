import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { WarehouseStateView } from "../utils/shiftBoard";

type Props = { state: WarehouseStateView };

export function ShiftWarehouseState({ state }: Props) {
  const [open, setOpen] = useState(false);
  const line = [
    `Na rampie: ${state.onRamp}`,
    `Rozładunek: ${state.unloading}`,
    `Do rozlokowania: ${state.awaitingPutaway}`,
    `Do pakowania po wykonaniu: ${state.unlockableOrders}`,
  ].join(" • ");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-1">
            Stan magazynu
          </p>
          <p className="text-sm font-semibold text-slate-800 leading-snug">{line}</p>
        </div>
        {open ? <ChevronUp size={16} className="shrink-0 mt-1" /> : <ChevronDown size={16} className="shrink-0 mt-1" />}
      </button>
      {open ? (
        <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t border-slate-100 pt-3">
          {[
            { label: "Na rampie", value: state.onRamp },
            { label: "Rozładunek", value: state.unloading },
            { label: "Oczekuje rozlokowania", value: state.awaitingPutaway },
            { label: "Rozlokowanie w toku", value: state.putawayInProgress },
            { label: "W drodze / awizacja", value: state.inboundPending },
            { label: "Do pakowania po wykonaniu", value: state.unlockableOrders },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className="text-xl font-black text-slate-900 mt-0.5 tabular-nums">{c.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
