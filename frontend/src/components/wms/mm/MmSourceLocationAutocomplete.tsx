import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ScanLine } from "lucide-react";

import type { WarehouseLocationItem } from "../../../api/warehouseGraphApi";

import { useAutocompleteDropdown } from "../../../hooks/useAutocompleteDropdown";

import { AutocompleteDropdownPanel } from "../AutocompleteDropdownPanel";

import { LocationTypeBadge } from "../../warehouse/LocationTypeBadge";



const MAX_SUGGESTIONS = 80;



type Props = {

  locations: WarehouseLocationItem[];

  disabled?: boolean;

  restrictToLocationId?: number | null;

  onSelectLocation: (loc: WarehouseLocationItem) => void;

  onSubmitScan: (raw: string) => void;

};



/** MM transfer source bins — exclude dock/packing pseudo-locations. */

export function isMmTransferSourceLocation(loc: WarehouseLocationItem): boolean {

  const kind = (loc.type || "").trim().toUpperCase();

  if (kind === "INBOUND" || kind === "OUTBOUND") return false;

  const code = (loc.code ?? loc.name ?? "").trim();

  if (!code) return false;

  const lower = code.toLowerCase();

  if (lower.includes("archived") || lower.includes("deleted") || lower.includes("nieaktyw")) {

    return false;

  }

  return true;

}



function locationLabel(loc: WarehouseLocationItem): string {

  return (loc.code ?? loc.name ?? "").trim() || `#${loc.id}`;

}



function locationMatchesQuery(loc: WarehouseLocationItem, q: string): boolean {

  const needle = q.trim().toLowerCase();

  if (!needle) return true;

  const code = locationLabel(loc).toLowerCase();

  const zone = (loc.zone ?? "").toLowerCase();

  const rack = (loc.capacity_type ?? "").toLowerCase();

  return code.includes(needle) || zone.includes(needle) || rack.includes(needle);

}



export function MmSourceLocationAutocomplete({

  locations,

  disabled,

  restrictToLocationId = null,

  onSelectLocation,

  onSubmitScan,

}: Props) {

  const [query, setQuery] = useState("");

  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const listRef = useRef<HTMLUListElement>(null);



  const eligibleLocations = useMemo(() => {

    let list = locations.filter(isMmTransferSourceLocation);

    if (restrictToLocationId != null && restrictToLocationId > 0) {

      list = list.filter((l) => l.id === restrictToLocationId);

    }

    return list.sort((a, b) =>

      locationLabel(a).localeCompare(locationLabel(b), "pl", { sensitivity: "base", numeric: true }),

    );

  }, [locations, restrictToLocationId]);



  const filteredLocations = useMemo(() => {

    const q = query.trim();

    if (!q) return eligibleLocations.slice(0, MAX_SUGGESTIONS);

    return eligibleLocations.filter((l) => locationMatchesQuery(l, q)).slice(0, MAX_SUGGESTIONS);

  }, [eligibleLocations, query]);



  const hasResults = filteredLocations.length > 0;

  const panelMounted =
    !disabled &&
    eligibleLocations.length > 0 &&
    (hasResults || query.trim().length > 0);

  const dropdown = useAutocompleteDropdown({
    query,
    enabled: !disabled,
    canMount: panelMounted,
    /** Show top locations on focus; filter once the user types. */
    requireQuery: false,
  });



  const pickLocation = useCallback(

    (loc: WarehouseLocationItem) => {

      dropdown.closeList();

      setQuery(locationLabel(loc));

      onSelectLocation(loc);

    },

    [dropdown, onSelectLocation],

  );



  useEffect(() => {

    setActiveIndex(0);

  }, [query, filteredLocations.length]);



  useEffect(() => {

    if (!dropdown.dropdownVisible || !listRef.current) return;

    const el = listRef.current.querySelector<HTMLElement>(`[data-mm-loc-index="${activeIndex}"]`);

    el?.scrollIntoView({ block: "nearest" });

  }, [activeIndex, dropdown.dropdownVisible]);



  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {

    if (dropdown.handleInputEscape(e)) return;



    if (e.key === "ArrowDown") {
      e.preventDefault();
      dropdown.openList();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filteredLocations.length - 1)));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      dropdown.openList();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter") {

      e.preventDefault();

      const raw = query.trim();

      if (!raw) return;

      if (dropdown.dropdownVisible && hasResults) {

        const loc = filteredLocations[activeIndex] ?? filteredLocations[0];

        if (loc) pickLocation(loc);

        return;

      }

      dropdown.closeList();

      onSubmitScan(raw);

      return;

    }

  };



  return (

    <div ref={dropdown.containerRef} className="relative w-full group">

      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-6 sm:pl-8">

        <ScanLine

          className="h-8 w-8 text-slate-400 transition-colors group-focus-within:text-[#5a4fcf] sm:h-10 sm:w-10"

          strokeWidth={2.5}

        />

      </div>

      <input

        ref={inputRef}

        type="text"

        autoFocus

        role="combobox"

        aria-expanded={dropdown.dropdownVisible && panelMounted}

        aria-controls="mm-source-location-list"

        aria-autocomplete="list"

        value={query}

        disabled={disabled}

        placeholder="Zeskanuj lokalizację lub wprowadź kod źródłowy..."

        onChange={(e) => {

          setQuery(e.target.value);

          dropdown.notifyInputChanged(e.target.value);

        }}

        onFocus={dropdown.onInputFocus}

        onKeyDown={handleKeyDown}

        className="w-full rounded-[2rem] border-2 border-slate-200 bg-slate-50/80 py-6 pl-[5rem] pr-8 text-lg font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:bg-slate-100 focus:border-[#5a4fcf] focus:bg-white focus:shadow-md focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50 sm:py-8 sm:pl-[6rem] sm:text-2xl"

      />



      <AutocompleteDropdownPanel mounted={panelMounted} visible={dropdown.dropdownVisible}>

        {!hasResults ? (

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center shadow-xl">

            <p className="text-sm font-bold text-slate-600">Brak lokalizacji</p>

          </div>

        ) : (

          <ul

            id="mm-source-location-list"

            ref={listRef}

            role="listbox"

            className="max-h-[min(24rem,50vh)] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl"

          >

            {filteredLocations.map((loc, idx) => {

              const code = locationLabel(loc);

              const active = idx === activeIndex;

              const kind = (loc.type || "PICK").trim() || "PICK";

              return (

                <li key={loc.id} role="presentation">

                  <button

                    type="button"

                    role="option"

                    aria-selected={active}

                    data-mm-loc-index={idx}

                    onMouseEnter={() => setActiveIndex(idx)}

                    onMouseDown={dropdown.preventOptionMouseDown}

                    onClick={() => pickLocation(loc)}

                    className={`flex w-full items-center justify-between gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 ${

                      active ? "bg-violet-50" : "hover:bg-slate-50"

                    }`}

                  >

                    <div className="min-w-0 flex-1">

                      <p className="truncate font-mono text-lg font-black tracking-tight text-slate-900">{code}</p>

                      {loc.zone ? (

                        <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">

                          Strefa {loc.zone}

                        </p>

                      ) : null}

                    </div>

                    <LocationTypeBadge

                      locationText={kind}

                      storageType={loc.storage_type ?? loc.type}

                      compact

                      className="shrink-0 max-w-[6.5rem]"

                    />

                  </button>

                </li>

              );

            })}

          </ul>

        )}

      </AutocompleteDropdownPanel>

    </div>

  );

}


