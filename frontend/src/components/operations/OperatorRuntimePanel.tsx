import type { OperatorSnapshot } from "../../hooks/runtime/useOperatorRuntime";

type Props = {
  self: OperatorSnapshot | null;
  peers: OperatorSnapshot[];
};

function OperatorCard({ op }: { op: OperatorSnapshot }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
      <div className="text-sm font-semibold text-slate-900">{op.displayName}</div>
      <div className="text-xs text-slate-600">{op.contextType}</div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
        <span>{op.zoneLabel}</span>
        {op.cartId != null ? <span>Wózek #{op.cartId}</span> : null}
        <span>idle {op.idleLabel}</span>
      </div>
    </div>
  );
}

export function OperatorRuntimePanel({ self, peers }: Props) {
  return (
    <div className="space-y-2">
      {self ? (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase text-slate-400">Ty</div>
          <OperatorCard op={self} />
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase text-slate-400">Aktywni</div>
        <div className="space-y-1.5">
          {peers.length === 0 ? (
            <p className="text-xs text-slate-400">Brak aktywnych operatorów.</p>
          ) : (
            peers.map((p) => <OperatorCard key={`${p.operatorUserId}-${p.activeTaskId}`} op={p} />)
          )}
        </div>
      </div>
    </div>
  );
}
