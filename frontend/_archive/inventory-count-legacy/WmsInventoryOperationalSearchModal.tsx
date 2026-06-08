import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Package, Search, X } from "lucide-react";

import {
  searchWmsInventory,
  searchWmsTaskProducts,
  type InventoryUniversalSearchResult,
} from "@/api/inventoryCountApi";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantId: number;
  warehouseId: number;
  documentId?: number;
  taskId?: number;
  onPickProduct: (scanCode: string) => void;
  onPickLocation: (locationCode: string, taskId?: number | null) => void;
  onPickCarrier: (carrierCode: string) => void;
};

type ProductRow = {
  key: string;
  product_id: number;
  name: string;
  ean?: string | null;
  sku?: string | null;
  image_url?: string | null;
  counted_qty?: number | null;
  scanCode: string;
};

export default function WmsInventoryOperationalSearchModal({
  open,
  onClose,
  tenantId,
  warehouseId,
  documentId,
  taskId,
  onPickProduct,
  onPickLocation,
  onPickCarrier,
}: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InventoryUniversalSearchResult | null>(null);
  const [taskMatches, setTaskMatches] = useState<
    Array<{
      product_id: number;
      counted_quantity: number | null;
      ean?: string | null;
      sku?: string | null;
      product_name?: string | null;
      image_url?: string | null;
    }>
  >([]);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResult(null);
        setTaskMatches([]);
        return;
      }
      setLoading(true);
      try {
        const [data, taskData] = await Promise.all([
          searchWmsInventory(tenantId, warehouseId, trimmed, documentId),
          taskId ? searchWmsTaskProducts(tenantId, taskId, trimmed).catch(() => []) : Promise.resolve([]),
        ]);
        setResult(data);
        setTaskMatches(taskData);
      } catch {
        setResult({ query: trimmed, locations: [], products: [], tasks: [] });
        setTaskMatches([]);
      } finally {
        setLoading(false);
      }
    },
    [documentId, taskId, tenantId, warehouseId],
  );

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void runSearch(query), 220);
    return () => window.clearTimeout(t);
  }, [open, query, runSearch]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResult(null);
      setTaskMatches([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const products = useMemo((): ProductRow[] => {
    if (!result) return [];
    const qtyByProduct = new Map(taskMatches.map((m) => [m.product_id, m.counted_quantity]));
    const imageByProduct = new Map(taskMatches.map((m) => [m.product_id, m.image_url]));
    return result.products.map((p) => ({
      key: `p-${p.product_id}`,
      product_id: p.product_id,
      name: p.name ?? p.sku ?? `#${p.product_id}`,
      ean: p.ean,
      sku: p.sku,
      image_url: p.image_url ?? imageByProduct.get(p.product_id) ?? null,
      counted_qty: qtyByProduct.get(p.product_id) ?? null,
      scanCode: p.ean ?? p.sku ?? String(p.product_id),
    }));
  }, [result, taskMatches]);

  const locations = useMemo(() => {
    if (!result) return [];
    return result.locations.filter((l) => l.zone !== "nośnik");
  }, [result]);

  const carriers = useMemo(() => {
    if (!result) return [];
    return result.locations.filter((l) => l.zone === "nośnik");
  }, [result]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-3 pt-[10vh]">
      <div className="w-full max-w-md rounded-lg border border-[#d0d7e2] bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-[#e8edf3] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[#5a6b7d]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="EAN, SKU, nazwa, lokalizacja, nośnik…"
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm font-semibold outline-none placeholder:text-[#a0aec0]"
          />
          <button type="button" onClick={onClose} className="rounded p-1 text-[#5a6b7d] hover:bg-[#f0f2f5]" aria-label="Zamknij">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-auto p-2">
          {loading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-[#5a6b7d]">
              <Loader2 className="h-4 w-4 animate-spin" /> Szukam…
            </p>
          ) : null}
          {!loading && query.trim().length >= 2 && products.length === 0 && locations.length === 0 && carriers.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#5a6b7d]">Brak wyników</p>
          ) : null}
          {products.length > 0 ? (
            <section className="mb-3">
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-[#8a9bb0]">Produkty</p>
              <ul className="space-y-1">
                {products.map((p) => (
                  <li key={p.key}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-[#f4f6f9] active:bg-[#eef1f5]"
                      onClick={() => {
                        onPickProduct(p.scanCode);
                        onClose();
                      }}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="max-h-full max-w-full object-contain" />
                        ) : (
                          <Package className="h-5 w-5 text-[#c5d0de]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#1a2b3c]">{p.name}</p>
                        <p className="truncate text-xs text-[#5a6b7d]">
                          {[p.ean, p.sku].filter(Boolean).join(" • ")}
                        </p>
                        {taskId && p.counted_qty != null ? (
                          <p className="text-xs font-semibold tabular-nums text-[#1e4d8c]">Policzone: {p.counted_qty}</p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {locations.length > 0 ? (
            <section className="mb-3">
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-[#8a9bb0]">Lokalizacje</p>
              <ul className="space-y-1">
                {locations.map((loc) => {
                  const task = result?.tasks.find((t) => t.location_id === loc.location_id);
                  const meta = [loc.zone, loc.aisle].filter(Boolean).join(" • ");
                  return (
                    <li key={`loc-${loc.location_id}-${loc.location_code}`}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-[#f4f6f9]"
                        onClick={() => {
                          onPickLocation(loc.location_code, task?.task_id ?? null);
                          onClose();
                        }}
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#1e4d8c]" />
                        <div>
                          <p className="text-sm font-bold text-[#1a2b3c]">{loc.location_code}</p>
                          {meta ? <p className="text-xs text-[#5a6b7d]">{meta}</p> : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {carriers.length > 0 ? (
            <section>
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-[#8a9bb0]">Nośniki</p>
              <ul className="space-y-1">
                {carriers.map((c) => (
                  <li key={`c-${c.carrier_id}-${c.location_code}`}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-[#f4f6f9]"
                      onClick={() => {
                        onPickCarrier(c.location_code);
                        onClose();
                      }}
                    >
                      <Package className="h-4 w-4 text-[#5a6b7d]" />
                      <span className="text-sm font-bold text-[#1a2b3c]">{c.location_code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <p className="border-t border-[#e8edf3] px-3 py-1.5 text-[10px] text-[#8a9bb0]">Ctrl+K · Enter aby wybrać</p>
      </div>
    </div>
  );
}
