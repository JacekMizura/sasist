import { OperatorTable } from "../../../components/operations/operators/OperatorTable";
import { useOperatorRuntime } from "../../../hooks/runtime/useOperatorRuntime";

export default function OperationsOperatorsPage() {
  const { selfSnapshot, peers, runtimeAvailable } = useOperatorRuntime();

  return (
    <div className="space-y-3 p-2 md:p-3">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Operatorzy</h1>
        <p className="text-xs text-slate-500">Kto pracuje, w jakiej strefie i nad czym</p>
      </header>
      {!runtimeAvailable ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Połączenie live niedostępne — dane operatorów mogą być niepełne.
        </p>
      ) : null}
      <OperatorTable self={selfSnapshot} peers={peers} />
    </div>
  );
}
