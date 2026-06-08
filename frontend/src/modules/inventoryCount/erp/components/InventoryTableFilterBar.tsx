import type { InventoryTableFilters } from "../inventoryTableFilters";

const inputClass =
  "rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400";

type Props = {
  filters: InventoryTableFilters;
  onChange: (next: InventoryTableFilters) => void;
  showDifferenceToggle?: boolean;
  showRecountToggle?: boolean;
  showUnknownToggle?: boolean;
};

export default function InventoryTableFilterBar({
  filters,
  onChange,
  showDifferenceToggle = true,
  showRecountToggle = true,
  showUnknownToggle = false,
}: Props) {
  const patch = (partial: Partial<InventoryTableFilters>) => onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
      <label className="min-w-[140px] flex-1">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-slate-500">
          Szukaj (EAN, SKU, produkt, lokalizacja)
        </span>
        <input
          className={`${inputClass} w-full`}
          value={filters.query}
          onChange={(e) => patch({ query: e.target.value })}
          placeholder="Szukaj…"
        />
      </label>
      <label className="w-28">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Operator</span>
        <input
          className={`${inputClass} w-full`}
          value={filters.operator}
          onChange={(e) => patch({ operator: e.target.value })}
          placeholder="Imię…"
        />
      </label>
      <label className="w-32">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Od</span>
        <input
          type="date"
          className={`${inputClass} w-full`}
          value={filters.dateFrom}
          onChange={(e) => patch({ dateFrom: e.target.value })}
        />
      </label>
      <label className="w-32">
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Do</span>
        <input
          type="date"
          className={`${inputClass} w-full`}
          value={filters.dateTo}
          onChange={(e) => patch({ dateTo: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 pb-0.5">
        {showDifferenceToggle ? (
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-700">
            <input
              type="checkbox"
              checked={filters.differencesOnly}
              onChange={(e) => patch({ differencesOnly: e.target.checked })}
            />
            Tylko różnice
          </label>
        ) : null}
        {showRecountToggle ? (
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-700">
            <input
              type="checkbox"
              checked={filters.recountOnly}
              onChange={(e) => patch({ recountOnly: e.target.checked })}
            />
            Konflikty liczenia
          </label>
        ) : null}
        {showUnknownToggle ? (
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-700">
            <input
              type="checkbox"
              checked={filters.unknownOnly}
              onChange={(e) => patch({ unknownOnly: e.target.checked })}
            />
            Nieznane produkty
          </label>
        ) : null}
      </div>
    </div>
  );
}
