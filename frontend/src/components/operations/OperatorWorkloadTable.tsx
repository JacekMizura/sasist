import type { OperatorSnapshot } from "../../hooks/runtime/useOperatorRuntime";

type Props = {
  self: OperatorSnapshot | null;
  peers: OperatorSnapshot[];
};

function Row({ op, label }: { op: OperatorSnapshot; label?: string }) {
  return (
    <tr className="border-b border-slate-100 text-xs">
      <td className="px-2 py-1.5 font-medium">{label ?? op.displayName}</td>
      <td className="px-2 py-1.5">{op.contextType}</td>
      <td className="px-2 py-1.5">{op.zoneLabel}</td>
      <td className="px-2 py-1.5 tabular-nums">{op.activeTaskId ?? "—"}</td>
      <td className="px-2 py-1.5">{op.idleLabel}</td>
      <td className="px-2 py-1.5 tabular-nums">{op.cartId ?? "—"}</td>
    </tr>
  );
}

export function OperatorWorkloadTable({ self, peers }: Props) {
  return (
    <div className="overflow-auto rounded border border-slate-200 bg-white">
      <table className="w-full min-w-[520px]">
        <thead className="bg-slate-100 text-[10px] font-semibold uppercase text-slate-600">
          <tr>
            <th className="px-2 py-1.5 text-left">Operator</th>
            <th className="px-2 py-1.5 text-left">Workflow</th>
            <th className="px-2 py-1.5 text-left">Strefa</th>
            <th className="px-2 py-1.5 text-left">Zadanie</th>
            <th className="px-2 py-1.5 text-left">Idle</th>
            <th className="px-2 py-1.5 text-left">Wózek</th>
          </tr>
        </thead>
        <tbody>
          {self ? <Row op={self} label={`${self.displayName} (Ty)`} /> : null}
          {peers.map((p) => (
            <Row key={`${p.operatorUserId}-${p.activeTaskId}`} op={p} />
          ))}
          {!self && peers.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-2 py-4 text-sm text-slate-400">
                Brak aktywnych operatorów.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
