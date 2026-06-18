import {
  ArrowUpDown,
  ChevronDown,
  Filter,
  MoreHorizontal,
  Package,
  Plus,
  Table2,
  Wrench,
} from "lucide-react";
import { memo, type MutableRefObject } from "react";
import { Link } from "react-router-dom";

import {
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../listPage/listSellasistTokens";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";

type Props = {
  loading: boolean;
  resultCount: number;
  activeFilterLabel: string;
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  openFilterFieldsRef: MutableRefObject<(() => void) | null>;
};

function ReturnsListToolbarInner({
  loading,
  resultCount,
  activeFilterLabel,
  filtersExpanded,
  onToggleFilters,
  openFilterFieldsRef,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">
            Zwroty
            {!loading ? (
              <span className="ml-2 text-lg font-normal text-slate-400">{resultCount} wyników</span>
            ) : null}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            to={WMS_ROUTES.returns}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Dodaj zwrot
          </Link>
          <Link
            to={WMS_ROUTES.returns}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Package className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            WMS
          </Link>
        </div>
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
            {filtersExpanded ? "Ukryj filtry" : "Dodatkowe filtry"}
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${filtersExpanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            className={`${listSellasistToolbarSquareBtn} !h-10 !w-10`}
            title="Sortowanie — kliknij nagłówki (wkrótce)"
            aria-label="Sortowanie"
          >
            <ArrowUpDown className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            disabled
            className={`${listSellasistToolbarSquareBtn} !h-10 !w-10 cursor-not-allowed opacity-40`}
            title="Kolumny tabeli — wkrótce"
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
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                onClick={() => openFilterFieldsRef.current?.()}
              >
                Widoczne pola filtrów
              </button>
            </div>
          </details>
          <Link
            to="/orders/returns/statuses"
            className={`${listSellasistToolbarSquareBtn} !h-10 !w-10`}
            title="Ustawienia statusów zwrotów"
            aria-label="Ustawienia statusów zwrotów"
          >
            <Wrench className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

export const ReturnsListToolbar = memo(ReturnsListToolbarInner);
