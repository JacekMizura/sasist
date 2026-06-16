import { useEffect, useMemo, useState } from "react";

import { getBundleWarehouseStock } from "../../../api/bundlesApi";
import { ProductWarehouseStockPanel } from "../../../components/products/ProductWarehouseStockPanel";
import type { MagazynInvRowDisplay } from "../../../components/products/MagazynInventoryLine";
import { ProductLikeSection } from "../../../components/catalog";

type WarehouseSnapshot = {
  name: string;
  stock_quantity?: number | null;
  unallocated_quantity?: number | null;
  locations_load_incomplete?: boolean;
  inventory?: MagazynInvRowDisplay[];
  disposition_stock?: unknown;
  commercially_sellable_qty?: number | null;
  sales_blocked_qty?: number | null;
  network_commercially_sellable_qty?: number | null;
};

type Props = {
  tenantId: number;
  bundleId: number;
  bundleName: string;
  /** Po zapisie zestawu STOCK — czy backend zwrócił powiązany magazyn (read-only). */
  warehouseReady: boolean;
};

function mapInventoryRows(inv: unknown): MagazynInvRowDisplay[] {
  if (!Array.isArray(inv) || inv.length === 0) return [];
  return inv.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      inventory_id: (r.inventory_id as number | null) ?? null,
      inventory_serial_ids: (r.inventory_serial_ids as number[]) ?? [],
      location_id: r.location_id as number | undefined,
      location_code: String(r.location_code ?? "").trim() || "—",
      location_type: String(r.location_type ?? "UNKNOWN"),
      quantity: Number(r.quantity) || 0,
      batch: (r.batch as string | null) ?? null,
      expiry: (r.expiry as string | null) ?? null,
      serial_range_label: (r.serial_range_label as string | null) ?? null,
      serial_numbers: r.serial_numbers as string[] | undefined,
      warehouse_id: r.warehouse_id as number | undefined,
      location_uuid: (r.location_uuid as string | null) ?? null,
      stock_disposition: (r.stock_disposition as string | null) ?? null,
      disposition_badge: (r.disposition_badge as string | null) ?? null,
      warehouse_carrier_id: (r.warehouse_carrier_id as number | null) ?? null,
      carrier_code: (r.carrier_code as string | null) ?? null,
      carrier_barcode: (r.carrier_barcode as string | null) ?? null,
      carrier_is_mixed: Boolean(r.carrier_is_mixed),
    };
  });
}

/** Magazyn gotowego zestawu — pełny widok jak produkt (STOCK_PRODUCTION, B1). */
export function BundleStockProductionWarehousePanel({
  tenantId,
  bundleId,
  bundleName,
  warehouseReady,
}: Props) {
  const [snapshot, setSnapshot] = useState<WarehouseSnapshot | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!warehouseReady || bundleId <= 0) {
      setSnapshot(null);
      setLoadErr(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setLoadErr(null);
    void (async () => {
      try {
        const data = await getBundleWarehouseStock(tenantId, bundleId);
        if (cancelled) return;
        setSnapshot({
          name: String(data.name ?? bundleName),
          stock_quantity: data.stock_quantity != null ? Number(data.stock_quantity) : null,
          unallocated_quantity:
            data.unallocated_quantity != null ? Number(data.unallocated_quantity) : null,
          locations_load_incomplete: Boolean(data.locations_load_incomplete),
          inventory: mapInventoryRows(data.inventory),
          disposition_stock: data.disposition_stock,
          commercially_sellable_qty:
            data.commercially_sellable_qty != null ? Number(data.commercially_sellable_qty) : null,
          sales_blocked_qty: data.sales_blocked_qty != null ? Number(data.sales_blocked_qty) : null,
          network_commercially_sellable_qty:
            data.network_commercially_sellable_qty != null
              ? Number(data.network_commercially_sellable_qty)
              : null,
        });
      } catch {
        if (!cancelled) setLoadErr("Nie udało się wczytać stanu magazynowego zestawu.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, bundleId, bundleName, warehouseReady]);

  const inventoryRows = useMemo(() => snapshot?.inventory ?? [], [snapshot?.inventory]);

  const physicalStockDisplay = useMemo(() => {
    const q = snapshot?.stock_quantity;
    if (q == null || Number.isNaN(Number(q))) return "—";
    return String(Math.round(Number(q)));
  }, [snapshot?.stock_quantity]);

  if (!warehouseReady) {
    return (
      <ProductLikeSection title="Stan magazynowy">
        <p className="text-sm text-slate-600">
          Zapisz zestaw w trybie „Produkowany / konfekcjonowany na magazyn”, aby zobaczyć stan, lokalizacje i ruchy
          magazynowe.
        </p>
      </ProductLikeSection>
    );
  }

  if (busy && !snapshot) {
    return <p className="text-sm text-slate-500">Wczytywanie magazynu…</p>;
  }

  if (loadErr) {
    return <p className="text-sm text-rose-700">{loadErr}</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Magazyn gotowego zestawu —{" "}
        <span className="font-semibold text-slate-900">{snapshot?.name ?? bundleName}</span>
      </p>
      <ProductWarehouseStockPanel
        physicalStockDisplay={physicalStockDisplay}
        totalStockDisplay={physicalStockDisplay}
        dispositionStock={snapshot?.disposition_stock as never}
        commerciallySellableQty={snapshot?.commercially_sellable_qty ?? null}
        salesBlockedQty={snapshot?.sales_blocked_qty ?? null}
        networkCommerciallySellableQty={snapshot?.network_commercially_sellable_qty ?? null}
        inventoryRows={inventoryRows}
        showInventoryLink
        emptyLocationsMessage={
          snapshot?.locations_load_incomplete
            ? "Dane lokalizacji nie zostały załadowane"
            : inventoryRows.length === 0 && (snapshot?.unallocated_quantity ?? 0) > 0
              ? `Brak wierszy lokalizacji — ${snapshot?.unallocated_quantity} szt. nieprzypisanych`
              : "Brak stanu magazynowego"
        }
      />
    </div>
  );
}
