import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { searchProductionLocations, type WarehouseLocationSearchRow } from "../../api/productionApi";

type Props = {
  tenantId: number;
  warehouseId: number;
  value: number | null;
  valueLabel?: string | null;
  onChange: (locationId: number, code: string) => void;
  recentLocationIds?: number[];
  recentLabels?: Record<number, string>;
  placeholder?: string;
  disabled?: boolean;
};

export function ProductionWarehouseLocationSearch({
  tenantId,
  warehouseId,
  value,
  valueLabel,
  onChange,
  recentLocationIds = [],
  recentLabels = {},
  placeholder = "Szukaj lokalizacji…",
  disabled = false,
}: Props) {
  const [query, setQuery] = useState(valueLabel ?? "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WarehouseLocationSearchRow[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (valueLabel) setQuery(valueLabel);
  }, [valueLabel, value]);

  const runSearch = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const data = await searchProductionLocations(tenantId, warehouseId, q, 20);
        setRows(data);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [tenantId, warehouseId],
  );

  const onQueryChange = (q: string) => {
    setQuery(q);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(q), 280);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const pick = (row: WarehouseLocationSearchRow) => {
    onChange(row.id, row.code);
    setQuery(row.code);
    setOpen(false);
  };

  const recentRows = recentLocationIds
    .filter((id) => id > 0 && id !== value)
    .map((id) => ({ id, code: recentLabels[id] ?? `#${id}` }));

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-violet-500">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <input
          type="text"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => {
            setOpen(true);
            void runSearch(query);
          }}
        />
        {value != null ? (
          <span className="shrink-0 text-xs font-mono text-slate-500">
            <MapPin className="inline h-3 w-3" aria-hidden /> #{value}
          </span>
        ) : null}
      </div>
      {open && !disabled ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {recentRows.length > 0 && !query.trim() ? (
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ostatnie</p>
              <ul className="mt-1 space-y-1">
                {recentRows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                      onClick={() => pick({ id: r.id, code: r.code })}
                    >
                      {r.code}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {loading ? (
            <p className="px-3 py-3 text-sm text-slate-500">Szukam…</p>
          ) : rows.length ? (
            <ul>
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-violet-50 ${
                      value === r.id ? "bg-violet-50 font-medium" : ""
                    }`}
                    onClick={() => pick(r)}
                  >
                    <span>{r.code}</span>
                    {r.operational_zone_type ? (
                      <span className="text-xs text-slate-400">{r.operational_zone_type}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-slate-500">Brak wyników.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
