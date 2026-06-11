import type { Ref } from "react";

import type { WmsReturnsAdvancedSearchFilters } from "./wmsReturnsAdvancedSearchTypes";

export type WmsReturnsOrderSearchPreview = {
  id: number;
  orderLabel: string;
  customer: string;
  phone: string;
  source: string;
  date: string;
  matchedReturnId: number | null;
};

type FieldKey = keyof WmsReturnsAdvancedSearchFilters;

const FIELD_ROWS: { key: FieldKey; label: string; placeholder: string; type?: string }[] = [
  { key: "firstName", label: "Imię", placeholder: "Jan" },
  { key: "lastName", label: "Nazwisko", placeholder: "Kowalski" },
  { key: "phone", label: "Telefon", placeholder: "500 123 123" },
  { key: "email", label: "Email", placeholder: "jan@example.com" },
  { key: "orderNumber", label: "Numer zamówienia", placeholder: "1121" },
  { key: "trackingNumber", label: "Numer listu przewozowego", placeholder: "LP123456789PL" },
  { key: "rmzNumber", label: "Numer RMZ", placeholder: "RMZ-123" },
  { key: "dateFrom", label: "Data od", placeholder: "", type: "date" },
  { key: "dateTo", label: "Data do", placeholder: "", type: "date" },
];

type Props = {
  open: boolean;
  onToggle: () => void;
  filters: WmsReturnsAdvancedSearchFilters;
  onFiltersChange: (patch: Partial<WmsReturnsAdvancedSearchFilters>) => void;
  onClearFilters: () => void;
  onSearch: () => void;
  loading: boolean;
  error: string | null;
  results: WmsReturnsOrderSearchPreview[];
  resultsLoading: boolean;
  onSelectResult: (preview: WmsReturnsOrderSearchPreview) => void;
  firstResultRef?: Ref<HTMLButtonElement | null>;
};

export function WmsReturnsAdvancedSearchPanel({
  open,
  onToggle,
  filters,
  onFiltersChange,
  onClearFilters,
  onSearch,
  loading,
  error,
  results,
  resultsLoading,
  onSelectResult,
  firstResultRef,
}: Props) {
  return (
    <div className="w-full text-left">
      <div className="text-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 underline-offset-2 transition hover:text-blue-800 hover:underline"
        >
          Wyszukiwanie zaawansowane
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {open ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
          <p className="mb-4 text-xs leading-relaxed text-slate-600">
            Uzupełnij dowolne pola — każde kolejne zawęża wyniki. Wyszukiwanie służy do znalezienia klienta, zamówienia
            lub zwrotu (bez SKU i EAN).
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELD_ROWS.map(({ key, label, placeholder, type }) => (
              <label key={key} className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                <input
                  type={type ?? "text"}
                  value={filters[key]}
                  onChange={(e) => onFiltersChange({ [key]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSearch();
                    }
                  }}
                  disabled={loading}
                  placeholder={placeholder}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSearch}
              disabled={loading}
              className="inline-flex h-11 min-w-[8rem] items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Szukam…" : "Szukaj"}
            </button>
            <button
              type="button"
              onClick={onClearFilters}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Wyczyść
            </button>
          </div>

          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </div>
      ) : null}

      {open && results.length > 0 ? (
        <div className="mt-6 w-full">
          <h3 className="mb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Wyniki wyszukiwania</h3>
          {resultsLoading ? (
            <p className="text-sm text-slate-500">Wczytywanie wyników…</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((preview, hi) => (
                <li key={preview.id}>
                  <button
                    type="button"
                    ref={hi === 0 ? firstResultRef : undefined}
                    className="flex w-full flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm outline-none transition hover:border-blue-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    onClick={() => onSelectResult(preview)}
                  >
                    <div className="text-xl font-bold tabular-nums text-slate-900">{preview.orderLabel}</div>
                    <div className="truncate text-base font-semibold text-slate-900">{preview.customer}</div>
                    <div className="truncate text-sm tabular-nums text-slate-600">{preview.phone || "—"}</div>
                    <div className="text-sm tabular-nums text-slate-500">{preview.date}</div>
                    <div className="truncate text-sm font-medium text-slate-500">{preview.source}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {open && !resultsLoading && !loading && results.length === 0 && !error ? (
        <p className="mt-4 text-center text-sm text-slate-500">Uzupełnij kryteria i kliknij „Szukaj”.</p>
      ) : null}
    </div>
  );
}
