import type { DirectSaleCompleteError } from "../../../types/directSalesCompletion";

type Props = {
  error: DirectSaleCompleteError;
  onRetry: () => void;
  onNewSale: () => void;
};

const PHASE_COPY: Record<DirectSaleCompleteError["phase"], { title: string; hint: string }> = {
  payment: {
    title: "Błąd płatności",
    hint: "Płatność nie została zaksięgowana. Sprawdź terminal lub metodę płatności i spróbuj ponownie.",
  },
  document: {
    title: "Błąd dokumentu",
    hint: "Wydanie mogło się udać, ale dokument nie został wygenerowany. Sprawdź kolejkę dokumentów lub wygeneruj ponownie.",
  },
  issue: {
    title: "Błąd wydania",
    hint: "Nie udało się zdjąć towaru z magazynu. Sprawdź stany i rezerwacje przed ponowną próbą.",
  },
  unknown: {
    title: "Błąd zakończenia sprzedaży",
    hint: "Operacja nie została dokończona. Sesja pozostaje aktywna — możesz spróbować ponownie.",
  },
};

export function CompleteErrorRecovery({ error, onRetry, onNewSale }: Props) {
  const copy = PHASE_COPY[error.phase];
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-red-900">{copy.title}</h2>
      <p className="mt-2 text-sm text-red-800">{error.message}</p>
      <p className="mt-1 text-xs text-red-700">{copy.hint}</p>
      {error.code ? <p className="mt-2 font-mono text-[10px] text-red-600">Kod: {error.code}</p> : null}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-red-800 px-4 py-2 text-sm font-medium text-white"
        >
          Spróbuj ponownie
        </button>
        <button
          type="button"
          onClick={onNewSale}
          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-800"
        >
          Anuluj i nowa sprzedaż
        </button>
      </div>
    </div>
  );
}
