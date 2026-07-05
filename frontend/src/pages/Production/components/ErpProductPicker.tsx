/**
 * ERP product picker — search by name, SKU, EAN, catalog number (no raw IDs in UI).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/api/axios";
import { ProductThumb } from "@/pages/Production/components/ProductThumb";
import { useAutocompleteDropdown } from "@/hooks/useAutocompleteDropdown";
import { AutocompleteDropdownPanel } from "@/components/wms/AutocompleteDropdownPanel";

export type ErpProductOption = {
  id: number;
  name: string;
  symbol?: string | null;
  sku?: string | null;
  ean?: string | null;
  catalog_number?: string | null;
  image_url?: string | null;
  manufacturer?: string | null;
  unit?: string | null;
};

type Props = {
  tenantId: number;
  label: string;
  placeholder?: string;
  value: ErpProductOption | null;
  onChange: (product: ErpProductOption | null) => void;
  disabled?: boolean;
  excludeProductId?: number;
};

function displaySku(p: ErpProductOption): string {
  return (p.symbol || p.sku || "").trim();
}

export function ErpProductPicker({
  tenantId,
  label,
  placeholder = "Szukaj po nazwie, SKU, EAN, nr katalogowym…",
  value,
  onChange,
  disabled,
  excludeProductId,
}: Props) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [options, setOptions] = useState<ErpProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dropdown = useAutocompleteDropdown({
    query,
    enabled: !disabled,
    canMount: options.length > 0,
  });

  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value?.name, value?.id]);

  const fetchProducts = useCallback(
    (search: string) => {
      const t = search.trim();
      if (t.length < 2) {
        setOptions([]);
        dropdown.closeList();
        return;
      }
      setLoading(true);
      api
        .get<{ items?: ErpProductOption[] } | ErpProductOption[]>("/products/", {
          params: { tenant_id: tenantId, search: t, limit: 16 },
        })
        .then((res) => {
          const data = res.data;
          const list = (
            data && typeof data === "object" && "items" in data
              ? (data as { items: ErpProductOption[] }).items
              : Array.isArray(data)
                ? data
                : []
          ).filter((p) => excludeProductId == null || p.id !== excludeProductId);
          setOptions(list);
          if (list.length > 0) dropdown.openList();
          else dropdown.closeList();
          setHighlightIndex(-1);
        })
        .catch(() => {
          setOptions([]);
          dropdown.closeList();
        })
        .finally(() => setLoading(false));
    },
    [tenantId, excludeProductId, dropdown.closeList, dropdown.openList],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchProducts(query);
      debounceRef.current = null;
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchProducts]);

  const selectProduct = (p: ErpProductOption) => {
    onChange(p);
    setQuery(p.name);
    dropdown.closeList();
    setOptions([]);
  };

  const clearSelection = () => {
    onChange(null);
    setQuery("");
    setOptions([]);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-2 py-2">
          <ProductThumb imageUrl={value.image_url} name={value.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{value.name}</p>
            <p className="truncate text-xs text-slate-500">
              {[displaySku(value), value.ean, value.catalog_number].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={clearSelection}
            className="shrink-0 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white"
          >
            Zmień
          </button>
        </div>
      ) : (
        <div ref={dropdown.containerRef} className="relative">
          <input
            type="search"
            value={query}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={dropdown.onInputFocus}
            onKeyDown={(e) => {
              if (!dropdown.dropdownVisible || options.length === 0) {
                if (e.key === "Escape") dropdown.handleInputEscape(e);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIndex((i) => (i < options.length - 1 ? i + 1 : i));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIndex((i) => (i > 0 ? i - 1 : -1));
              } else if (e.key === "Enter" && highlightIndex >= 0) {
                e.preventDefault();
                selectProduct(options[highlightIndex]);
              } else if (e.key === "Escape") {
                dropdown.handleInputEscape(e);
              }
            }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            autoComplete="off"
          />
          {loading ? <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</span> : null}
          <AutocompleteDropdownPanel mounted={dropdown.canShowDropdown} visible={dropdown.dropdownVisible}>
            <ul className="max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl" role="listbox">
              {options.map((p, i) => (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={i === highlightIndex}
                  className={`cursor-pointer px-2 py-2 ${i === highlightIndex ? "bg-violet-50" : "hover:bg-slate-50"}`}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onMouseDown={(e) => {
                    dropdown.preventOptionMouseDown(e);
                    selectProduct(p);
                  }}
                >
                  <div className="flex items-start gap-2">
                    <ProductThumb imageUrl={p.image_url} name={p.name} size="sm" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        SKU: {displaySku(p) || "—"} · EAN: {p.ean || "—"}
                      </p>
                      {p.catalog_number ? (
                        <p className="text-xs text-slate-500">Nr kat.: {p.catalog_number}</p>
                      ) : null}
                      {p.manufacturer ? <p className="text-xs text-slate-600">{p.manufacturer}</p> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </AutocompleteDropdownPanel>
        </div>
      )}
    </div>
  );
}
