import { useMemo } from "react";
import type { LayoutState, WarehouseProduct } from "../../../types/warehouse";
import { normalizeInventoryLocationUuid, type InventoryMaps } from "../../../pages/WarehouseDesigner/inventoryMaps";

export interface ProductLocatorSidebarProps {
  product: WarehouseProduct;
  totalQuantity: number;
  primaryQuantity: number;
  reserveQuantity: number;
  layout: LayoutState;
  inventoryMaps: InventoryMaps | null;
  getProductImageUrl: (p: WarehouseProduct) => string | null;
  onSelectLocation: (locationUUID: string) => void;
}

export function ProductLocatorSidebar({
  product,
  totalQuantity,
  primaryQuantity,
  reserveQuantity,
  layout,
  inventoryMaps,
  getProductImageUrl,
  onSelectLocation,
}: ProductLocatorSidebarProps) {
  const uuidToBinMeta = useMemo(() => {
    const map = new Map<string, { locationLabel: string; storageType?: string }>();
    for (const rack of layout.racks) {
      for (const bin of rack.bins ?? []) {
        const u = normalizeInventoryLocationUuid(bin.locationUUID);
        if (!u) continue;
        const label = (bin.label ?? bin.location_id ?? "").trim() || u;
        map.set(u, { locationLabel: label, storageType: bin.storage_type });
      }
    }
    return map;
  }, [layout.racks]);

  type LocationRow = { locationUUID: string; locationLabel: string; quantity: number; isReserve: boolean };

  const locations: LocationRow[] = (() => {
    if (inventoryMaps && inventoryMaps.byProduct) {
      const invRowsForProduct = inventoryMaps.byProduct.get(product.id) ?? [];
      const qtyByUuid = new Map<string, number>();
      for (const inv of invRowsForProduct) {
        const u = normalizeInventoryLocationUuid(inv.location_uuid);
        if (!u) continue;
        const q = Number(inv.quantity) || 0;
        if (q <= 0) continue;
        qtyByUuid.set(u, (qtyByUuid.get(u) ?? 0) + q);
      }

      return Array.from(qtyByUuid.entries())
        .map(([locUuid, qty]) => {
          const meta = uuidToBinMeta.get(locUuid);
          const fallbackLabel = (() => {
            const rows = inventoryMaps.byLocationUuid.get(locUuid) ?? [];
            const first = rows[0];
            const raw = first ? (first.location_name ?? "").trim() || String(first.location_id) : "";
            return raw.replace(/\s+/g, " ").trim() || locUuid;
          })();
          return {
            locationUUID: locUuid,
            locationLabel: meta?.locationLabel ?? fallbackLabel,
            quantity: qty,
            isReserve: meta?.storageType === "reserve",
          };
        })
        .sort((a, b) => b.quantity - a.quantity);
    }

    const uuidToLabel: Record<string, string> = {};
    for (const rack of layout.racks) {
      for (const bin of rack.bins ?? []) {
        if (bin.locationUUID != null && (bin.label != null || bin.location_id != null)) {
          uuidToLabel[bin.locationUUID] = (bin.label ?? bin.location_id ?? "").trim() || bin.locationUUID;
        }
      }
    }

    return (product.assignedLocations ?? [])
      .map((a) => ({
        locationUUID: a.locationUUID,
        locationLabel: a.locationAddress ?? uuidToLabel[a.locationUUID] ?? a.locationUUID,
        quantity: a.quantity,
        isReserve: a.storageType === "reserve",
      }))
      .sort((a, b) => b.quantity - a.quantity);
  })();

  const imageUrl = getProductImageUrl(product);

  return (
    <aside className="flex h-full min-h-0 w-[320px] flex-none flex-col self-stretch overflow-hidden rounded-r-xl border-l border-slate-700 bg-slate-800">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-600 shrink-0">
        <h2 className="text-xs font-black uppercase text-slate-300">LOKALIZACJA PRODUKTU</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-xl border border-slate-600 bg-slate-700/80 p-3">
          <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-slate-600 border border-slate-500">
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover z-10"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-100 break-words line-clamp-2">{product.name}</div>
            <div className="text-xs text-slate-400 mt-1 truncate">SKU: {product.sku ?? "—"} · EAN: {product.ean ?? "—"}</div>
            <div className="text-xs text-slate-300 mt-1">
              Sztuki łącznie: <span className="font-mono font-semibold text-slate-100">{totalQuantity}</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Podst. <span className="font-mono text-slate-300">{primaryQuantity}</span> · Rez.{" "}
              <span className="font-mono text-amber-300">{reserveQuantity}</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">Wszystkie lokalizacje</h3>
          <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
            {locations.length === 0 ? (
              <p className="text-slate-500 text-xs py-2">Brak przypisanych lokalizacji</p>
            ) : (
              locations.map((loc) => (
                <button
                  key={loc.locationUUID}
                  type="button"
                  onClick={() => onSelectLocation(loc.locationUUID)}
                  className={`w-full flex justify-between items-center text-left px-2 py-1.5 rounded text-xs transition hover:bg-slate-600/80 ${loc.isReserve ? "text-amber-300" : "text-slate-300"}`}
                >
                  <span className="flex items-center gap-1 truncate min-w-0 mr-2">
                    {loc.isReserve && "🔒"}
                    {loc.locationLabel}
                  </span>
                  <span className="font-mono shrink-0">{loc.quantity} szt.</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
