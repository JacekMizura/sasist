import { OperatorWorkloadTable } from "../../../components/operations/OperatorWorkloadTable";
import { useOperatorRuntime } from "../../../hooks/runtime/useOperatorRuntime";

export default function OperationsOperatorsPage() {
  const { selfSnapshot, peers, runtimeAvailable } = useOperatorRuntime();

  return (
    <div className="space-y-3 p-3">
      <h1 className="text-base font-semibold text-slate-900">Obciążenie operatorów</h1>
      {!runtimeAvailable ? (
        <p className="text-sm text-slate-500">Runtime wyłączony — dane mogą być niepełne.</p>
      ) : null}
      <OperatorWorkloadTable self={selfSnapshot} peers={peers} />
    </div>
  );
}
