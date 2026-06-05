import { OperatorRuntimePanel } from "../../../components/operations/OperatorRuntimePanel";
import { useOperatorRuntime } from "../../../hooks/runtime/useOperatorRuntime";

export default function OperationsOperatorsPage() {
  const { selfSnapshot, peers, runtimeAvailable } = useOperatorRuntime();

  return (
    <div className="space-y-3 p-3">
      <h1 className="text-base font-semibold text-slate-900">Operatorzy — runtime</h1>
      {!runtimeAvailable ? (
        <p className="text-sm text-slate-500">Runtime wyłączony — widok offline.</p>
      ) : null}
      <OperatorRuntimePanel self={selfSnapshot} peers={peers} />
    </div>
  );
}
