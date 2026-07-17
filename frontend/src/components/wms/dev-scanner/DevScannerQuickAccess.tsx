import type { DevScanHistoryEntry } from "../../../utils/devScannerStorage";
import { DevScannerKindIcon } from "./DevScannerKindIcon";
import { objectKindLabel, type DevScannerObjectKind } from "./types";

type QuickSlot = {
  kind: DevScannerObjectKind;
  label: string;
  entry: DevScanHistoryEntry | null;
};

type Props = {
  slots: QuickSlot[];
  onScan: (entry: DevScanHistoryEntry) => void;
  large?: boolean;
};

export function DevScannerQuickAccess({ slots, onScan, large }: Props) {
  const filled = slots.filter((s) => s.entry != null);
  if (filled.length === 0) return null;

  return (
    <section>
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">Szybki dostęp</p>
      <div className={`grid gap-1.5 ${large ? "grid-cols-2" : "grid-cols-2"}`}>
        {slots.map((slot) => {
          const e = slot.entry;
          if (!e) {
            return (
              <div
                key={slot.kind}
                className={`rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-2 ${
                  large ? "min-h-[4.5rem] py-3" : "min-h-[3.75rem] py-2"
                }`}
              >
                <p className="text-[10px] font-bold text-slate-400">{slot.label}</p>
                <p className="mt-1 text-[10px] text-slate-300">—</p>
              </div>
            );
          }
          const name = e.displayName || e.productName || e.locationLabel || e.code;
          return (
            <button
              key={slot.kind}
              type="button"
              onClick={() => onScan(e)}
              className={`flex flex-col items-start rounded-xl border border-slate-200 bg-white px-2.5 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50 active:bg-sky-50 ${
                large ? "min-h-[4.5rem] py-3" : "min-h-[3.75rem] py-2"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                <DevScannerKindIcon kind={e.kind} size={14} />
                {slot.label}
              </span>
              <span className="mt-1 line-clamp-2 text-xs font-bold leading-snug text-slate-900">{name}</span>
              <span className="mt-0.5 font-mono text-[10px] text-slate-500">{e.code}</span>
              <span className="sr-only">{objectKindLabel(e.kind)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
