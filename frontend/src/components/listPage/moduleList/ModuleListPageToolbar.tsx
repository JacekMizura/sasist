import {
  ArrowUpDown,
  ChevronDown,
  Filter,
  MoreHorizontal,
  Table2,
  Wrench,
} from "lucide-react";
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
  /** Dodatkowe przyciski przed sortowaniem (np. widoki). */
  extraToolbarControls?: ReactNode;
  /** Dodatkowe pozycje menu „Więcej” (przed „Widoczne pola filtrów”). */
  moreMenuItems?: ReactNode;
  onColumnsClick?: () => void;
  columnsDisabled?: boolean;
  sortDisabled?: boolean;
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
  moreMenuItems,
  onColumnsClick,
  columnsDisabled = true,
  sortDisabled = false,
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
          <button
            type="button"
            disabled={sortDisabled}
            className={`${listSellasistToolbarSquareBtn} !h-10 !w-10 ${sortDisabled ? "cursor-not-allowed opacity-40" : ""}`}
            title="Sortowanie — kliknij nagłówki (wkrótce)"
            aria-label="Sortowanie"
          >
            <ArrowUpDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </button>
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
          <details className="relative">
            <summary
              className={`${listSellasistToolbarSquareBtn} !h-10 !w-10 cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
              aria-label="Więcej opcji"
            >
              <MoreHorizontal className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            </summary>
            <div className="absolute right-0 z-50 mt-1 min-w-[13rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60">
              {moreMenuItems ? (
                <>
                  {moreMenuItems}
                  <div className="my-1 border-t border-slate-100" role="separator" />
                </>
              ) : null}
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                onClick={() => openFilterFieldsRef.current?.()}
              >
                Widoczne pola filtrów
              </button>
            </div>
          </details>
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
