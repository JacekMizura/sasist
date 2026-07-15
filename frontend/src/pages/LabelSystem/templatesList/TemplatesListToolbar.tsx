import { LayoutGrid, List, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { SORT_OPTIONS, type SortValue, type ViewMode } from "./templatesListTypes";

type Props = {
  typeLabel: string;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  sortBy: SortValue;
  onSortChange: (v: SortValue) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  selectedCount: number;
  exportBusy: boolean;
  onExportSelected: () => void;
  onSelectAllOnPage: () => void;
  pageItemCount: number;
  onNew: () => void;
};

export default function TemplatesListToolbar({
  typeLabel,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  selectedCount,
  exportBusy,
  onExportSelected,
  onSelectAllOnPage,
  pageItemCount,
  onNew,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{typeLabel}</h1>
          <p className="mt-0.5 text-sm text-slate-500">Szablony etykiet dla wybranego typu</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={selectedCount === 0 || exportBusy}
            onClick={onExportSelected}
            className="rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {exportBusy ? "Eksport…" : `Eksport JSON (${selectedCount})`}
          </button>
          <button
            type="button"
            onClick={onSelectAllOnPage}
            disabled={pageItemCount === 0}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:shadow-md disabled:opacity-50"
          >
            Zaznacz stronę
          </button>
          <Link
            to="/settings/import?kind=label_templates"
            className="rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Import szablonów
          </Link>
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nowy szablon
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Szukaj szablonów…"
          className="min-w-[200px] flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300/40 sm:max-w-md"
        />
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortValue)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400"
          aria-label="Sortowanie"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => onViewModeChange("list")}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              viewMode === "list" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            <List className="h-3.5 w-3.5" />
            Lista
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("card")}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              viewMode === "card" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Karty
          </button>
        </div>
      </div>
    </div>
  );
}
