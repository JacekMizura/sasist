import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, MapPin, Package, Search } from "lucide-react";

import { searchWmsInventory, type InventoryUniversalSearchResult } from "@/api/inventoryCountApi";
import { WMS_INV } from "../wmsIndustrialTheme";

export type EmergencySearchPick =
  | { kind: "location"; locationId: number; locationCode: string; taskId?: number | null }
  | { kind: "task"; taskId: number }
  | { kind: "product"; productId: number; sku?: string | null; ean?: string | null };

type Props = {
  tenantId: number;
  warehouseId: number;
  documentId?: number;
  disabled?: boolean;
  onPick: (pick: EmergencySearchPick) => void;
};

/** Single inline emergency search — fallback when barcode unreadable. */
export default function WmsInventoryEmergencySearch({
  tenantId,
  warehouseId,
  documentId,
  disabled,
  onPick,
}: Props) {
  const [expanded, setExpanded] = useState(false);
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
      } catch {
        setResult({ query: trimmed, locations: [], products: [], tasks: [] });
      } finally {
        setLoading(false);
      }
    },
    [documentId, tenantId, warehouseId],
  );

  useEffect(() => {
    if (!expanded) return;
    const t = window.setTimeout(() => void runSearch(query), 300);
    return () => window.clearTimeout(t);
  }, [expanded, query, runSearch]);

  const rows: Array<{ key: string; icon: "loc" | "prod" | "task"; title: string; sub: string; onClick: () => void }> =
    [];

  if (result) {
    for (const loc of result.locations) {
      const task = result.tasks.find((t) => t.location_id === loc.location_id);
      rows.push({
        key: `loc-${loc.location_id}-${loc.location_code}`,
        icon: loc.zone === "nośnik" ? "loc" : "loc",
        title: loc.location_code,
        sub: loc.zone === "nośnik" ? "Nośnik" : "Lokalizacja",
        onClick: () =>
          onPick({
            kind: "location",
            locationId: loc.location_id,
            locationCode: loc.location_code,
            taskId: task?.task_id ?? null,
          }),
      });
    }
    for (const p of result.products) {
      rows.push({
        key: `prod-${p.product_id}`,
        icon: "prod",
        title: p.name ?? p.sku ?? `#${p.product_id}`,
        sub: [p.ean, p.sku, p.catalog_number, p.stock_hint].filter(Boolean).join(" · "),
        onClick: () => onPick({ kind: "product", productId: p.product_id, sku: p.sku, ean: p.ean }),
      });
    }
    for (const t of result.tasks) {
      if (rows.some((r) => r.key === `task-${t.task_id}`)) continue;
      rows.push({
        key: `task-${t.task_id}`,
        icon: "task",
        title: t.location_code ?? t.task_number,
        sub: `${t.progress_percent}% · zadanie`,
        onClick: () => onPick({ kind: "task", taskId: t.task_id }),
      });
    }
  }

  return (
    <section className={`rounded-lg border ${WMS_INV.border} ${WMS_INV.surface}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold ${WMS_INV.textMuted} hover:bg-[#eef3fa] disabled:opacity-50`}
      >
        <Search className="h-4 w-4 shrink-0 text-[#1e4d8c]" />
        Wyszukiwanie awaryjne {expanded ? "▲" : "▼"}
      </button>
      {expanded ? (
        <div className="border-t border-[#c5d0de] px-3 pb-3 pt-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="EAN, SKU, lokalizacja, nośnik…"
            className={`${WMS_INV.input} text-sm`}
            autoFocus
          />
          {loading ? (
            <p className={`mt-2 flex items-center gap-2 text-xs ${WMS_INV.textMuted}`}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Szukam…
            </p>
          ) : null}
          {!loading && query.trim().length >= 2 && rows.length === 0 ? (
            <p className={`mt-2 text-xs ${WMS_INV.textMuted}`}>Brak wyników</p>
          ) : null}
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
            {rows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => {
                    row.onClick();
                    setExpanded(false);
                    setQuery("");
                    setResult(null);
                  }}
                  className={`flex w-full items-center gap-2 rounded border ${WMS_INV.border} px-2 py-1.5 text-left ${WMS_INV.rowHover}`}
                >
                  {row.icon === "loc" ? (
                    <MapPin className="h-4 w-4 shrink-0 text-[#1e4d8c]" />
                  ) : row.icon === "prod" ? (
                    <Package className="h-4 w-4 shrink-0 text-[#1e4d8c]" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#b45309]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#1a2b3c]">{row.title}</span>
                    <span className="block truncate text-xs text-[#5a6b7d]">{row.sub}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
