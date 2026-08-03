import type { WarehouseOperationsSummary } from "../../api/warehouseOperationsApi";

type Props = {
  ops: WarehouseOperationsSummary | null;
  loading?: boolean;
};

/** Jedna zwarta sekcja — obciążenie zmiany, nie dashboard. */
export function PulpitCrewLoad({ ops, loading }: Props) {
  if (loading && !ops) {
    return <p className="text-sm text-slate-500">Ładowanie operatorów…</p>;
  }
  if (!ops) {
    return <p className="text-sm text-slate-500">Brak danych o obciążeniu.</p>;
  }

  const rows = [
    { label: "Aktywni", value: ops.active_operators },
    { label: "Bezczynni", value: ops.idle_operators },
    { label: "Kompletacja", value: ops.picking },
    { label: "Pakowanie", value: ops.packing },
    { label: "Opóźnione", value: ops.delayed_operations, warn: true },
  ];

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="min-w-[4.5rem]">
          <p className="text-xs text-slate-500">{r.label}</p>
          <p
            className={`text-lg font-bold tabular-nums ${
              r.warn && r.value > 0 ? "text-amber-700" : "text-slate-900"
            }`}
          >
            {r.value}
          </p>
        </div>
      ))}
    </div>
  );
}
