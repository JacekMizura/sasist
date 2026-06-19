import { ChevronDown, Filter, SlidersHorizontal, Table2, Wrench } from "lucide-react";
import { memo, type MutableRefObject, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../listSellasistTokens";

export type ModuleListPageToolbarProps = {
  title: string;
  resultCount?: number;
  loading?: boolean;
  activeFilterLabel: string;
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  openFilterFieldsRef: MutableRefObject<(() => void) | null>;
  headerActions?: ReactNode;
  settingsHref?: string;
  settingsTitle?: string;
  filtersToggleLabelExpanded?: string;
  filtersToggleLabelCollapsed?: string;
  /** Dodatkowe przyciski przed konfiguracją kolumn. */
  extraToolbarControls?: ReactNode;
  onColumnsClick?: () => void;
  columnsDisabled?: boolean;
  /** Przycisk konfiguracji pól filtrów (modal) — domyślnie widoczny. */
  showFilterFieldsButton?: boolean;
};

function ModuleListPageToolbarInner({
  title,
  resultCount,
  loading = false,
  activeFilterLabel,
  filtersExpanded,
  onToggleFilters,
  openFilterFieldsRef,
  headerActions,
  settingsHref,
  settingsTitle = "Ustawienia statusów",
  filtersToggleLabelExpanded = "Ukryj filtry",
  filtersToggleLabelCollapsed = "Dodatkowe filtry",
  extraToolbarControls,
  onColumnsClick,
  columnsDisabled = true,
  showFilterFieldsButton = true,
}: ModuleListPageToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">
            {title}
            {!loading && resultCount != null ? (
              <span className="ml-2 text-lg font-normal text-slate-400">{resultCount} wyników</span>
            ) : null}
          </h1>
        </div>
        {headerActions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Wybrany filtr:{" "}
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm font-medium text-slate-900 shadow-sm">
            {activeFilterLabel}
          </span>
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleFilters}
            className={`${listSellasistToolbarToggleBtn} inline-flex !h-10 items-center gap-2 whitespace-nowrap`}
            aria-expanded={filtersExpanded}
          >
            <Filter className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            {filtersExpanded ? filtersToggleLabelExpanded : filtersToggleLabelCollapsed}
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {extraToolbarControls}
          {showFilterFieldsButton ? (
            <button
              type="button"
              onClick={() => openFilterFieldsRef.current?.()}
              className={`${listSellasistToolbarSquareBtn} inline-flex !h-10 items-center gap-2 whitespace-nowrap px-3 !w-auto`}
              title="Widoczne pola filtrów"
              aria-label="Widoczne pola filtrów"
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              <span className="hidden text-sm font-medium sm:inline">Pola filtrów</span>
            </button>
          ) : null}
          <button
            type="button"
            disabled={columnsDisabled && !onColumnsClick}
            onClick={onColumnsClick}
            className={`${listSellasistToolbarSquareBtn} !h-10 !w-10 ${columnsDisabled && !onColumnsClick ? "cursor-not-allowed opacity-40" : ""}`}
            title="Kolumny tabeli"
            aria-label="Kolumny tabeli"
          >
            <Table2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </button>
          {settingsHref ? (
            <Link
              to={settingsHref}
              className={`${listSellasistToolbarSquareBtn} !h-10 !w-10`}
              title={settingsTitle}
              aria-label={settingsTitle}
            >
              <Wrench className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const ModuleListPageToolbar = memo(ModuleListPageToolbarInner);
