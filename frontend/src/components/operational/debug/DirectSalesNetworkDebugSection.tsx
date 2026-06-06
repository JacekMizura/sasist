import {
  clearDirectSalesNetworkLog,
  useDirectSalesNetworkLog,
} from "../../../modules/directSales/debug/directSalesNetworkLog";

export function DirectSalesNetworkDebugSection() {
  const entries = useDirectSalesNetworkLog();

  if (!entries.length) {
    return (
      <p className="mt-1 text-[9px] text-amber-800">
        Direct-sales network: brak żądań (add-product / set-customer).
      </p>
    );
  }

  return (
    <details className="mt-1" open>
      <summary className="cursor-pointer font-medium">
        Direct-sales network ({entries.length})
      </summary>
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          onClick={() => clearDirectSalesNetworkLog()}
          className="rounded border border-amber-400 px-1 py-0.5 text-[9px]"
        >
          Wyczyść
        </button>
      </div>
      <ul className="max-h-40 space-y-1 overflow-auto">
        {entries.map((row) => (
          <li key={row.at + row.path} className="rounded bg-white/60 p-1 font-mono text-[9px]">
            <div className="font-semibold">
              {row.method} {row.path}
              {row.status != null ? ` → ${row.status}` : ""}
            </div>
            <div className="text-amber-900">req: {JSON.stringify(row.requestBody)}</div>
            {row.validationDetail != null ? (
              <div className="text-red-700">422: {JSON.stringify(row.validationDetail)}</div>
            ) : null}
            {row.responseBody != null ? (
              <div className="text-slate-700">res: {JSON.stringify(row.responseBody).slice(0, 400)}</div>
            ) : null}
            {row.errorMessage && row.status !== 422 ? (
              <div className="text-red-600">{row.errorMessage}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
