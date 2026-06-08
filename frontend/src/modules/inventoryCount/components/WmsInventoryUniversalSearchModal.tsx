import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, Package, Search, X } from "lucide-react";

import { searchWmsInventory, type InventoryUniversalSearchResult } from "../../../api/inventoryCountApi";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  warehouseId: number;
  documentId?: number;
  onPickLocation?: (locationId: number, locationCode: string) => void;
  onPickTask?: (taskId: number) => void;
  onPickProduct?: (productId: number, sku?: string | null) => void;
};

export default function WmsInventoryUniversalSearchModal({
  open,
  onClose,
  tenantId,
  warehouseId,
  documentId,
  onPickLocation,
  onPickTask,
  onPickProduct,
}: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InventoryUniversalSearchResult | null>(null);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResult(null);
        return;
      }
      setLoading(true);
      try {
        const data = await searchWmsInventory(tenantId, warehouseId, trimmed, documentId);
        setResult(data);
      } finally {
        setLoading(false);
      }
    },
    [documentId, tenantId, warehouseId],
  );

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void runSearch(query), 250);
    return () => window.clearTimeout(t);
  }, [open, query, runSearch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#1e3a5f]/40 p-4 pt-[8vh]">
      <div className={`w-full max-w-xl rounded-xl border-2 ${WMS_INV.borderStrong} ${WMS_INV.surface} shadow-2xl`}>
        <div className={`flex items-center gap-2 border-b ${WMS_INV.border} px-4 py-3`}>
          <Search className="h-5 w-5 text-[#1e4d8c]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="EAN, SKU, nazwa, lokalizacja, fragment kodu…"
            className={`${WMS_INV.input} flex-1 border-0 px-0 focus:ring-0`}
          />
          <button type="button" onClick={onClose} className={WMS_INV.btnGhost} aria-label="Zamknij">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-auto p-3">
          {loading ? (
            <p className={`flex items-center gap-2 py-8 ${WMS_INV.textMuted}`}>
              <Loader2 className="h-4 w-4 animate-spin" /> Szukam…
            </p>
          ) : null}
          {!loading && result ? (
            <div className="space-y-4">
              {result.locations.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-[#1e4d8c]">Lokalizacje</h3>
                  <ul className="space-y-1">
                    {result.locations.map((loc) => (
                      <li key={loc.location_id}>
                        <button
                          type="button"
                          className={`flex w-full items-center gap-2 rounded-lg border ${WMS_INV.border} px-3 py-2 text-left ${WMS_INV.rowHover}`}
                          onClick={() => {
                            onPickLocation?.(loc.location_id, loc.location_code);
                            onClose();
                          }}
                        >
                          <MapPin className="h-4 w-4 text-[#1e4d8c]" />
                          <span className="font-bold">{loc.location_code}</span>
                          {loc.zone ? <span className="text-xs text-[#5a6b7d]">{loc.zone}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {result.products.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-[#1e4d8c]">Produkty</h3>
                  <ul className="space-y-1">
                    {result.products.map((p) => (
                      <li key={p.product_id}>
                        <button
                          type="button"
                          className={`flex w-full flex-col rounded-lg border ${WMS_INV.border} px-3 py-2 text-left ${WMS_INV.rowHover}`}
                          onClick={() => {
                            onPickProduct?.(p.product_id, p.sku);
                            onClose();
                          }}
                        >
                          <span className="font-bold">{p.name ?? p.sku ?? `#${p.product_id}`}</span>
                          <span className="text-xs text-[#5a6b7d]">
                            {[p.sku, p.ean, p.catalog_number].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {result.tasks.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-[#1e4d8c]">Zadania</h3>
                  <ul className="space-y-1">
                    {result.tasks.map((t) => (
                      <li key={t.task_id}>
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between rounded-lg border ${WMS_INV.border} px-3 py-2 ${WMS_INV.rowHover}`}
                          onClick={() => {
                            onPickTask?.(t.task_id);
                            onClose();
                          }}
                        >
                          <span className="font-bold">{t.location_code ?? t.task_number}</span>
                          <span className="text-xs tabular-nums">{t.progress_percent}%</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {!result.locations.length && !result.products.length && !result.tasks.length ? (
                <p className={`py-8 text-center ${WMS_INV.textMuted}`}>Brak wyników</p>
              ) : null}
            </div>
          ) : null}
          {!loading && query.trim().length >= 2 && !result ? (
            <p className={`py-8 text-center ${WMS_INV.textMuted}`}>Wpisz min. 2 znaki</p>
          ) : null}
        </div>
        <div className={`border-t ${WMS_INV.border} px-4 py-2 text-xs ${WMS_INV.textMuted}`}>
          <Package className="mr-1 inline h-3.5 w-3.5" />
          Tryb awaryjny — dostępny na każdym kroku liczenia
        </div>
      </div>
    </div>
  );
}
