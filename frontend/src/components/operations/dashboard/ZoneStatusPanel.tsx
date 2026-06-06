import type { ZonePressure } from "../../../hooks/runtime/useZonePressure";
import {
  zoneDisplayName,
  zonePressureLabel,
} from "../../../services/operations/operationsTerminology";

const DISPLAY_ZONES = ["PICKFACE", "PICKUP", "RECEIVING", "BACKROOM", "SHOWROOM"] as const;

const LEVEL_RING: Record<ZonePressure["level"], string> = {
  OK: "ring-emerald-200",
  LOW: "ring-amber-200",
  PRESSURE: "ring-orange-300",
  BLOCKED: "ring-red-300",
};

type Props = { zones: ZonePressure[] };

export function ZoneStatusPanel({ zones }: Props) {
  const byKey = new Map(zones.map((z) => [z.zone, z]));

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strefy</h2>
      <div className="space-y-2">
        {DISPLAY_ZONES.map((key) => {
          const z =
            byKey.get(key) ??
            byKey.get(key === "PICKUP" ? "SALES" : key) ??
            ({
              zone: key,
              level: "OK" as const,
              label: "OK",
              openReplenishments: 0,
              blockedTasks: 0,
              lowStockCount: 0,
              activeOperators: 0,
              queuePressure: 0,
              taskCount: 0,
              alertCount: 0,
            } satisfies ZonePressure);
          return (
            <div
              key={key}
              className={`rounded-lg border border-slate-200 bg-white p-2.5 ring-2 ring-offset-1 ${LEVEL_RING[z.level]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">{zoneDisplayName(key)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                  {zonePressureLabel(z.level)}
                </span>
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-slate-600">
                <div className="flex justify-between">
                  <dt>Otwarte zadania</dt>
                  <dd className="font-medium tabular-nums">{z.openReplenishments + z.blockedTasks}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Operatorzy</dt>
                  <dd className="font-medium tabular-nums">{z.activeOperators}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Niski stan</dt>
                  <dd className="font-medium tabular-nums">{z.lowStockCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Alerty</dt>
                  <dd className="font-medium tabular-nums">{z.alertCount}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}
