type Props = {
  onRefresh: () => void;
};

export function DirectSalesUnavailable({ onRefresh }: Props) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Sprzedaż bezpośrednia jest obecnie wyłączona</p>
        <p className="mt-2 text-sm text-slate-600">
          Moduł operacyjny nie jest dostępny na tym środowisku. Klasyczny WMS działa bez zmian.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white"
          >
            Odśwież
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            Sprawdź połączenie
          </button>
        </div>
      </div>
    </div>
  );
}
