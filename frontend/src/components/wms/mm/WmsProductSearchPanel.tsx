import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Package, Search } from "lucide-react";

import type { WmsMmLocationInventoryRow } from "../../../api/wmsMmTransferApi";

import { useAutocompleteDropdown } from "../../../hooks/useAutocompleteDropdown";

import { AutocompleteDropdownPanel } from "../AutocompleteDropdownPanel";



type Props = {

  sourceLocationId: number | null;

  sourceLocationName?: string | null;

  inventoryRows: WmsMmLocationInventoryRow[];

  selectedProductId?: number | null;

  disabled?: boolean;

  onSelectProduct: (row: WmsMmLocationInventoryRow) => void;

  onCreateTemporary?: () => void;

};



function fmtQty(n: number) {

  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);

}



function matchesQuery(row: WmsMmLocationInventoryRow, q: string): boolean {

  const needle = q.trim().toLowerCase();

  if (!needle) return true;

  const name = (row.product_name || "").toLowerCase();

  const sku = (row.product_sku || "").toLowerCase();

  const ean = (row.product_ean || "").toLowerCase();

  return name.includes(needle) || sku.includes(needle) || ean.includes(needle);

}



export function WmsProductSearchPanel({

  sourceLocationId,

  sourceLocationName,

  inventoryRows,

  selectedProductId = null,

  disabled,

  onSelectProduct,

  onCreateTemporary,

}: Props) {

  const [query, setQuery] = useState("");

  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const listRef = useRef<HTMLUListElement>(null);



  const inStockRows = useMemo(

    () => inventoryRows.filter((r) => (Number(r.quantity_total) || 0) > 0),

    [inventoryRows],

  );



  const filteredRows = useMemo(() => {

    const q = query.trim();

    if (!q) return inStockRows;

    return inStockRows.filter((r) => matchesQuery(r, q));

  }, [inStockRows, query]);



  const showEmptyLocation = sourceLocationId != null && inStockRows.length === 0;

  const showNoResults =

    sourceLocationId != null &&

    query.trim().length > 0 &&

    filteredRows.length === 0 &&

    inStockRows.length > 0;



  const dropdown = useAutocompleteDropdown({

    query,

    enabled: !disabled && sourceLocationId != null,

    canMount: showNoResults || filteredRows.length > 0 || query.trim().length > 0,

  });



  const pickRow = useCallback(

    (row: WmsMmLocationInventoryRow) => {

      dropdown.closeList();

      setQuery((row.product_name || "").trim());

      onSelectProduct(row);

    },

    [dropdown, onSelectProduct],

  );



  useEffect(() => {

    setActiveIndex(0);

  }, [query, filteredRows.length]);



  useEffect(() => {

    if (!dropdown.dropdownVisible || !listRef.current) return;

    const el = listRef.current.querySelector<HTMLElement>(`[data-mm-pick-index="${activeIndex}"]`);

    el?.scrollIntoView({ block: "nearest" });

  }, [activeIndex, dropdown.dropdownVisible]);



  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {

    if (dropdown.handleInputEscape(e)) return;



    if (!dropdown.canShowDropdown && e.key !== "ArrowDown") return;



    if (e.key === "ArrowDown") {

      e.preventDefault();

      dropdown.openList();

      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filteredRows.length - 1)));

      return;

    }

    if (e.key === "ArrowUp") {

      e.preventDefault();

      dropdown.openList();

      setActiveIndex((i) => Math.max(i - 1, 0));

      return;

    }

    if (e.key === "Enter") {

      if (filteredRows.length === 0) return;

      e.preventDefault();

      const row = filteredRows[activeIndex] ?? filteredRows[0];

      if (row) pickRow(row);

    }

  };



  return (

    <div className="relative w-full max-w-2xl">

      {sourceLocationName ? (

        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">

          Stan na lokalizacji{" "}

          <span className="font-mono text-indigo-600">{sourceLocationName}</span>

          <span className="ml-2 tabular-nums text-slate-500">({inStockRows.length})</span>

        </p>

      ) : null}



      <div ref={dropdown.containerRef} className="relative">

        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

        <input

          ref={inputRef}

          type="search"

          role="combobox"

          aria-expanded={dropdown.dropdownVisible && filteredRows.length > 0}

          aria-controls="mm-location-product-list"

          aria-autocomplete="list"

          value={query}

          onChange={(e) => {

            setQuery(e.target.value);

            dropdown.notifyInputChanged(e.target.value);

          }}

          onFocus={dropdown.onInputFocus}

          onKeyDown={handleKeyDown}

          placeholder="Nazwa, SKU lub EAN…"

          disabled={disabled || sourceLocationId == null}

          className="w-full rounded-2xl border-2 border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base font-semibold text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"

        />



        <AutocompleteDropdownPanel mounted={dropdown.canShowDropdown} visible={dropdown.dropdownVisible}>

          {filteredRows.length > 0 ? (

            <ul

              id="mm-location-product-list"

              ref={listRef}

              role="listbox"

              className="max-h-[min(28rem,55vh)] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl"

            >

              {filteredRows.map((row, idx) => {

                const selected = row.product_id === selectedProductId;

                const active = idx === activeIndex;

                const name =

                  (row.product_name || "").trim() || (row.product_id != null ? `Produkt #${row.product_id}` : "—");

                const sku = (row.product_sku || "").trim();

                const ean = (row.product_ean || "").trim();

                return (

                  <li key={row.product_id} role="presentation">

                    <button

                      type="button"

                      role="option"

                      aria-selected={selected || active}

                      data-mm-pick-index={idx}

                      onMouseEnter={() => setActiveIndex(idx)}

                      onMouseDown={dropdown.preventOptionMouseDown}

                      onClick={() => pickRow(row)}

                      className={`flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2.5 text-left transition-colors last:border-0 ${

                        selected

                          ? "bg-violet-50 ring-1 ring-inset ring-violet-200"

                          : active

                            ? "bg-slate-50"

                            : "hover:bg-slate-50"

                      }`}

                    >

                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white">

                        {row.product_image_url ? (

                          <img

                            src={row.product_image_url}

                            alt=""

                            className="max-h-10 max-w-10 object-contain mix-blend-multiply"

                          />

                        ) : (

                          <Package size={18} className="text-slate-300" strokeWidth={2} />

                        )}

                      </div>

                      <div className="min-w-0 flex-1">

                        <p className="truncate text-sm font-bold leading-tight text-slate-900">{name}</p>

                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-slate-500">

                          {sku ? (

                            <span>

                              SKU <span className="font-mono text-slate-700">{sku}</span>

                            </span>

                          ) : null}

                          {ean ? (

                            <span>

                              EAN <span className="font-mono text-slate-700">{ean}</span>

                            </span>

                          ) : (

                            <span className="text-amber-700">Brak EAN</span>

                          )}

                        </div>

                      </div>

                      <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black tabular-nums text-emerald-800">

                        {fmtQty(row.quantity_total)} szt.

                      </span>

                    </button>

                  </li>

                );

              })}

            </ul>

          ) : showNoResults ? (

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-xl">

              <p className="text-sm font-semibold text-slate-700">Brak wyników na tej lokalizacji.</p>

              {onCreateTemporary ? (

                <button

                  type="button"

                  onMouseDown={dropdown.preventOptionMouseDown}

                  onClick={() => {

                    dropdown.closeList();

                    onCreateTemporary();

                  }}

                  className="mt-3 w-full rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50 px-4 py-2.5 text-sm font-black uppercase text-indigo-900 hover:bg-indigo-100"

                >

                  + Utwórz produkt tymczasowy

                </button>

              ) : null}

            </div>

          ) : null}

        </AutocompleteDropdownPanel>

      </div>



      {sourceLocationId == null ? (

        <p className="mt-2 text-xs font-medium text-slate-500">Najpierw zeskanuj lokalizację źródłową.</p>

      ) : null}



      {showEmptyLocation ? (

        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">

          <p className="text-sm font-bold text-slate-700">Brak produktów na lokalizacji</p>

        </div>

      ) : null}

    </div>

  );

}


