import { LayoutGrid, List, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { PrimaryButton } from "../../../design-system";

import { SORT_OPTIONS, type SortValue, type ViewMode } from "./templatesListTypes";
import {
  TEMPLATES_LIST_GHOST_BTN_CLASS,
  TEMPLATES_LIST_SEARCH_INPUT_CLASS,
  TEMPLATES_LIST_SECONDARY_BTN_CLASS,
  TEMPLATES_LIST_SELECT_CLASS,
  TEMPLATES_LIST_VIEW_TOGGLE_BTN_CLASS,
  TEMPLATES_LIST_VIEW_TOGGLE_SHELL_CLASS,
} from "./templatesListLayout";
import TemplatesListToolbarShell from "./TemplatesListToolbarShell";

type Props = {
  typeLabel: string;
  subtitle?: string;
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
  subtitle = "Szablony etykiet dla wybranego typu",
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
    <TemplatesListToolbarShell
      title={typeLabel}
      subtitle={subtitle}
      actions={
        <>
          <button
            type="button"
            disabled={selectedCount === 0 || exportBusy}
            onClick={onExportSelected}
            className={TEMPLATES_LIST_GHOST_BTN_CLASS}
          >
            {exportBusy ? "Eksport…" : `Eksport JSON (${selectedCount})`}
          </button>
          <button
            type="button"
            onClick={onSelectAllOnPage}
            disabled={pageItemCount === 0}
            className={TEMPLATES_LIST_SECONDARY_BTN_CLASS}
          >
            Zaznacz stronę
          </button>
          <Link to="/settings/import?kind=label_templates" className={TEMPLATES_LIST_GHOST_BTN_CLASS}>
            Import szablonów
          </Link>
          <PrimaryButton type="button" density="compact" onClick={onNew}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nowy szablon
          </PrimaryButton>
        </>
      }
      filters={
        <>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Szukaj szablonów…"
            className={TEMPLATES_LIST_SEARCH_INPUT_CLASS}
          />
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortValue)}
            className={TEMPLATES_LIST_SELECT_CLASS}
            aria-label="Sortowanie"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className={TEMPLATES_LIST_VIEW_TOGGLE_SHELL_CLASS}>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={[
                TEMPLATES_LIST_VIEW_TOGGLE_BTN_CLASS,
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
                TEMPLATES_LIST_VIEW_TOGGLE_BTN_CLASS,
                viewMode === "card" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Karty
            </button>
          </div>
        </>
      }
    />
  );
}
