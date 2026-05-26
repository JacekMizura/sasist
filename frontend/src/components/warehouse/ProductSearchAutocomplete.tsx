import { useState, useCallback, useEffect, useRef } from "react";
import api from "../../api/axios";
import { useAutocompleteDropdown } from "../../hooks/useAutocompleteDropdown";
import { AutocompleteDropdownPanel } from "../wms/AutocompleteDropdownPanel";

const TENANT_ID = 1;

export type CatalogProductOption = {
  id: number;
  name: string;
  ean?: string;
  symbol?: string;
  length?: number;
  width?: number;
  height?: number;
  volume?: number;
  image_url?: string | null;
  imageUrl?: string | null;
};

function volumeDm3(p: CatalogProductOption): number {
  if (p.volume != null && p.volume > 0) return p.volume;
  const l = p.length ?? 0,
    w = p.width ?? 0,
    h = p.height ?? 0;
  if (l && w && h) return (l * w * h) / 1000;
  return 0;
}

export type ProductSearchAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onSelectProduct: (product: {
    name: string;
    sku: string;
    ean: string;
    volume_dm3: number;
    image_url?: string | null;
  }) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

export function ProductSearchAutocomplete({
  value,
  onChange,
  onSelectProduct,
  placeholder = "Wpisz nazwę produktu...",
  required = false,
  disabled = false,
}: ProductSearchAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<CatalogProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dropdown = useAutocompleteDropdown({
    query,
    enabled: !disabled,
    canMount: options.length > 0,
  });

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const fetchProducts = useCallback((search: string) => {
    if (!search.trim()) {
      setOptions([]);
      dropdown.closeList();
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      tenant_id: String(TENANT_ID),
      name: search.trim(),
      limit: "20",
    });
    api
      .get<{ items?: CatalogProductOption[] } | CatalogProductOption[]>(`/products/?${params.toString()}`)
      .then((res) => {
        const data = res.data;
        const list = data && typeof data === "object" && "items" in data ? (data as { items: CatalogProductOption[] }).items : Array.isArray(data) ? data : [];
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
  }, [dropdown.closeList, dropdown.openList]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchProducts(query);
      debounceRef.current = null;
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchProducts]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    dropdown.notifyInputChanged(v);
  };

  const handleSelect = (p: CatalogProductOption) => {
    const name = p.name ?? "";
    const sku = p.symbol?.trim() || p.ean?.trim() || "";
    const ean = p.ean?.trim() || "";
    const vol = volumeDm3(p);
    const image_url = (p.image_url ?? (p as { imageUrl?: string }).imageUrl ?? "").trim() || undefined;
    setQuery(name);
    onChange(name);
    onSelectProduct({ name, sku, ean, volume_dm3: vol, image_url: image_url || undefined });
    dropdown.closeList();
    setOptions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    } else if (e.key === "Enter" && highlightIndex >= 0 && options[highlightIndex]) {
      e.preventDefault();
      handleSelect(options[highlightIndex]);
    } else if (e.key === "Escape") {
      dropdown.handleInputEscape(e);
      setHighlightIndex(-1);
    }
  };

  return (
    <div ref={dropdown.containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={dropdown.onInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
          Szukam...
        </div>
      )}
      <AutocompleteDropdownPanel mounted={dropdown.canShowDropdown} visible={dropdown.dropdownVisible}>
        <ul className="w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
          {options.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === highlightIndex}
              className={`px-3 py-2 cursor-pointer text-sm text-slate-800 ${
                i === highlightIndex ? "bg-cyan-50" : "hover:bg-slate-50"
              }`}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                dropdown.preventOptionMouseDown(e);
                handleSelect(p);
              }}
            >
              <div className="font-medium truncate">{p.name ?? "—"}</div>
              <div className="text-xs text-slate-500 truncate">
                {[p.symbol, p.ean].filter(Boolean).join(" · ") || "—"}
              </div>
            </li>
          ))}
        </ul>
      </AutocompleteDropdownPanel>
    </div>
  );
}
