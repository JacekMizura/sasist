import type { DirectSaleCompleteError } from "../../../types/directSalesCompletion";
import { resolveCompleteOperatorMessage } from "../../../modules/directSales/errors/completeErrorMessages";

type Props = {
  error: DirectSaleCompleteError;
  onRetry: () => void;
  onNewSale: () => void;
  onDismiss: () => void;
};

export function CompleteErrorModal({ error, onRetry, onNewSale, onDismiss }: Props) {
  const copy = resolveCompleteOperatorMessage(error);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div
        role="alertdialog"
        aria-labelledby="ds-complete-error-title"
        className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 shadow-xl"
      >
        <h2 id="ds-complete-error-title" className="text-lg font-semibold text-red-900">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm text-slate-800">{copy.message}</p>
        <p className="mt-1 text-xs text-slate-600">{copy.hint}</p>
        {error.step ? (
          <p className="mt-2 text-xs text-slate-500">
            Etap: <span className="font-medium text-slate-700">{error.step}</span>
          </p>
        ) : null}
        {error.code ? (
          <p className="mt-1 font-mono text-[10px] text-slate-400">Kod: {error.code}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            Zamknij
          </button>
          <button
            type="button"
            onClick={onNewSale}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-800"
          >
            Nowa sprzedaż
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white"
          >
            Spróbuj ponownie
          </button>
        </div>
      </div>
    </div>
  );
}
