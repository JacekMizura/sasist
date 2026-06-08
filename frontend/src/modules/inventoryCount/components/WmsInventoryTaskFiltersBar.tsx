import { Search } from "lucide-react";

import { WMS_INV } from "../wmsIndustrialTheme";

export type TaskQueueFilters = {
  search: string;
  zone: string;
  status: string;
  recountOnly: boolean;
  unresolvedOnly: boolean;
  varianceOnly: boolean;
  completedOnly: boolean;
};

type Props = {
  filters: TaskQueueFilters;
  onChange: (next: Partial<TaskQueueFilters>) => void;
  onOpenSearch: () => void;
};

export default function WmsInventoryTaskFiltersBar({ filters, onChange, onOpenSearch }: Props) {
  return (
    <div className={`sticky top-0 z-20 space-y-2 border-b-2 ${WMS_INV.border} ${WMS_INV.surface} pb-3 pt-1`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6b7d]" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Lokalizacja, SKU, EAN, zadanie…"
            className={`${WMS_INV.input} pl-10`}
          />
        </div>
        <button type="button" className={WMS_INV.btnAccent} onClick={onOpenSearch}>
          Szukaj (Ctrl+K)
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide">
        <input
          type="text"
          value={filters.zone}
          onChange={(e) => onChange({ zone: e.target.value })}
          placeholder="Strefa"
          className={`${WMS_INV.input} max-w-[120px] py-1.5 text-xs`}
        />
        <select
          value={filters.status}
          onChange={(e) => onChange({ status: e.target.value })}
          className={`${WMS_INV.input} max-w-[140px] py-1.5 text-xs`}
        >
          <option value="">Status: wszystkie</option>
          <option value="open">Otwarte</option>
          <option value="in_progress">W trakcie</option>
          <option value="assigned">Przypisane</option>
          <option value="done">Zakończone</option>
        </select>
        {(
          [
            ["recountOnly", "Przeliczenie"],
            ["unresolvedOnly", "Nierozwiązane"],
            ["varianceOnly", "Różnice"],
            ["completedOnly", "Zakończone"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border-2 px-2 py-1.5 ${WMS_INV.border} ${WMS_INV.surface}`}>
            <input
              type="checkbox"
              checked={filters[key]}
              onChange={(e) => onChange({ [key]: e.target.checked })}
              className="h-4 w-4 accent-[#1e4d8c]"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
