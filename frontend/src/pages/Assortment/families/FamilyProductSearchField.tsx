import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { searchProductsCatalog, type ProductSearchHit } from "../../../api/productsSearchApi";
import { GhostButton, Input } from "../../../design-system";

type Props = {
  tenantId: number;
  selectedId: number | null;
  selectedLabel?: string | null;
  placeholder?: string;
  onSelect: (hit: ProductSearchHit | null) => void;
  disabled?: boolean;
};

/**
 * Compact product typeahead for Family base / attach flows.
 */
export function FamilyProductSearchField({
  tenantId,
  selectedId,
  selectedLabel,
  placeholder = "Szukaj produktu (nazwa, SKU, EAN)…",
  onSelect,
  disabled,
}: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductSearchHit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || selectedId != null) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setBusy(true);
      void searchProductsCatalog(tenantId, term, 12)
        .then((rows) => {
          if (!cancelled) setHits(rows);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, tenantId, selectedId]);

  if (selectedId != null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {selectedLabel || `Produkt #${selectedId}`}
          </p>
          <p className="text-xs text-slate-500">ID {selectedId}</p>
        </div>
        <GhostButton
          type="button"
          density="compact"
          disabled={disabled}
          title="Wyczyść"
          onClick={() => {
            onSelect(null);
            setQ("");
          }}
        >
          <X className="h-4 w-4" />
        </GhostButton>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          value={q}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      {busy ? <p className="mt-1 text-xs text-slate-400">Szukam…</p> : null}
      {hits.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => {
                  onSelect(h);
                  setQ("");
                  setHits([]);
                }}
              >
                <span className="text-sm font-medium text-slate-900">{h.name || `Produkt #${h.id}`}</span>
                <span className="text-xs text-slate-500">
                  {[h.sku || h.symbol, h.ean].filter(Boolean).join(" · ") || `ID ${h.id}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
