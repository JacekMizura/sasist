type Props = {
  onRetry?: () => void;
};

/** Isolated fallback — operational UI failed; classic WMS shell remains usable. */
export function OperationsErrorFallback({ onRetry }: Props) {
  return (
    <div className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Panel operacji tymczasowo niedostępny</p>
      <p className="mt-1 text-amber-800">
        Dane runtime mogą być niepełne podczas wdrożenia. Klasyczny WMS i OMS działają bez zmian.
      </p>
      {onRetry ? (
        <button
          type="button"
          className="mt-3 rounded bg-amber-900 px-3 py-1.5 text-xs font-medium text-white"
          onClick={onRetry}
        >
          Odśwież panel
        </button>
      ) : null}
    </div>
  );
}
