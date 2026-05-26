/**
 * Rezerwa pod słownik / strukturę kategorii produktów (API pod moduł przygotowujemy osobno).
 */
export default function ProductCategoriesPage() {
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Kategorie produktów</h2>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Moduł kategorii będzie podłączony do istniejącego modelu produktów. Tymczasowo klasyfikację i powiązania ustawisz w
        edycji produktu oraz na liście produktów (filtry, producenci).
      </p>
    </div>
  );
}
