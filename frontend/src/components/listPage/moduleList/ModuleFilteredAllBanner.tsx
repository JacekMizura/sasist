type ModuleFilteredAllBannerProps = {
  count: number;
  onClear: () => void;
};

export function ModuleFilteredAllBanner({ count, onClear }: ModuleFilteredAllBannerProps) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      Zaznaczono {count} rekordów pasujących do filtrów.{" "}
      <button
        type="button"
        className="font-semibold text-sky-900 underline decoration-sky-400 underline-offset-2 hover:text-sky-950"
        onClick={onClear}
      >
        Wyczyść zaznaczenie
      </button>
    </div>
  );
}
