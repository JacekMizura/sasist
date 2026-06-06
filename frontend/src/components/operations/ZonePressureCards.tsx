import type { ZonePressure } from "../../hooks/runtime/useZonePressure";

type Props = {
  zones: ZonePressure[];
};

const LEVEL_STYLE: Record<ZonePressure["level"], string> = {
  OK: "bg-emerald-50 text-emerald-800 border-emerald-200",
  LOW: "bg-amber-50 text-amber-900 border-amber-200",
  PRESSURE: "bg-orange-50 text-orange-900 border-orange-200",
  BLOCKED: "bg-red-50 text-red-800 border-red-200",
};

export function ZonePressureCards({ zones }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
      {zones.map((z) => (
        <div
          key={z.zone}
          className={`rounded-md border px-2 py-1.5 ${LEVEL_STYLE[z.level]}`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{z.zone}</div>
          <div className="text-sm font-bold">{z.label}</div>
          <div className="text-[10px] opacity-70">
            uzupełn.: {z.openReplenishments} · blok: {z.blockedTasks} · niski: {z.lowStockCount}
          </div>
          <div className="text-[10px] opacity-60">
            op: {z.activeOperators} · kolejka: {z.queuePressure}%
          </div>
        </div>
      ))}
    </div>
  );
}
