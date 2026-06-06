import type { OperatorSnapshot } from "../../../hooks/runtime/useOperatorRuntime";
import { operatorActivityLabel, zoneDisplayName } from "../../../services/operations/operationsTerminology";
import { safeDisplay } from "../../../utils/safeStrings";

type Props = {
  self: OperatorSnapshot | null;
  peers: OperatorSnapshot[];
};

function activityCount(peer: OperatorSnapshot): number {
  return peer.activeTaskId != null ? 1 : 0;
}

function Row({ op, label }: { op: OperatorSnapshot; label?: string }) {
  const zone = zoneDisplayName(op.zoneLabel);
  const activity = operatorActivityLabel(op.contextType);
  const idle = op.idleLabel === "—" ? "Aktywny" : `Bezczynny ${op.idleLabel}`;

  return (
    <tr className="border-b border-slate-100 text-sm hover:bg-slate-50/50">
      <td className="px-3 py-2 font-medium text-slate-900">{label ?? op.displayName}</td>
      <td className="px-3 py-2 text-slate-700">
        {op.activeTaskId ? `Zadanie #${op.activeTaskId}` : "—"}
      </td>
      <td className="px-3 py-2 text-slate-600">{zone}</td>
      <td className="px-3 py-2 tabular-nums text-slate-700">{activityCount(op)}</td>
      <td className="px-3 py-2 text-slate-600">{idle}</td>
      <td className="px-3 py-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
          {activity}
        </span>
      </td>
      <td className="px-3 py-2 tabular-nums text-slate-500">{op.cartId ?? "—"}</td>
    </tr>
  );
}

export function OperatorTable({ self, peers }: Props) {
  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[640px]">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">Operator</th>
            <th className="px-3 py-2 text-left">Aktualne zadanie</th>
            <th className="px-3 py-2 text-left">Strefa</th>
            <th className="px-3 py-2 text-left">Aktywne zadania</th>
            <th className="px-3 py-2 text-left">Bezczynność</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Wózek</th>
          </tr>
        </thead>
        <tbody>
          {self ? <Row op={self} label={`${self.displayName} (Ty)`} /> : null}
          {peers.map((p) => (
            <Row key={`${p.operatorUserId}-${p.activeTaskId}`} op={p} />
          ))}
          {!self && peers.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">Brak aktywnych operatorów</p>
                <p className="mt-1 text-xs text-slate-500">
                  Gdy operatorzy rozpoczną pracę, zobaczysz ich status i strefę tutaj.
                </p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
