import { useMemo } from "react";
import type { LayoutState, WarehouseProduct } from "../../../types/warehouse";
import { activeBinsForRack, compareLocationUuidsByLayoutOrder, getDisplayLocationLabel } from "../warehouseUtils";
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
      for (const bin of activeBinsForRack(rack)) {
        const u = normalizeInventoryLocationUuid(bin.locationUUID);
        if (!u) continue;
        map.set(u, { locationLabel: getDisplayLocationLabel(rack, bin, layout), storageType: bin.storage_type });
      }
    }
    return map;
  }, [layout]);

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
        .sort((a, b) => {
          const q = b.quantity - a.quantity;
          if (q !== 0) return q;
          return compareLocationUuidsByLayoutOrder(layout, a.locationUUID, b.locationUUID);
        });
    }

    const uuidToLabel: Record<string, string> = {};
    for (const rack of layout.racks) {
      for (const bin of activeBinsForRack(rack)) {
        const u = (bin.locationUUID ?? "").trim();
        if (u) uuidToLabel[u] = getDisplayLocationLabel(rack, bin, layout);
      }
    }

    return (product.assignedLocations ?? [])
      .map((a) => ({
        locationUUID: a.locationUUID,
        locationLabel: uuidToLabel[a.locationUUID] ?? a.locationAddress ?? a.locationUUID,
        quantity: a.quantity,
        isReserve: a.storageType === "reserve",
      }))
      .sort((a, b) => {
        const q = b.quantity - a.quantity;
        if (q !== 0) return q;
        return compareLocationUuidsByLayoutOrder(layout, a.locationUUID, b.locationUUID);
      });
  })();

  const imageUrl = getProductImageUrl(product);

  return (
    <aside className="flex h-full min-h-0 w-[380px] flex-none flex-col self-stretch overflow-hidden rounded-r-xl border-l border-slate-700 bg-slate-800">
      <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-600 shrink-0">
        <h2 className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">Lokalizacja produktu</h2>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
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
          <div className="space-y-2 max-h-[min(60vh,24rem)] overflow-y-auto pr-0.5">
            {locations.length === 0 ? (
              <p className="text-slate-500 text-sm py-3">Brak przypisanych lokalizacji</p>
            ) : (
              locations.map((loc) => (
                <button
                  key={loc.locationUUID}
                  type="button"
                  onClick={() => onSelectLocation(loc.locationUUID)}
                  className={`group flex w-full flex-col gap-1 rounded-xl border px-3 py-3 text-left shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.99] ${
                    loc.isReserve
                      ? "border-amber-500/35 bg-slate-700/50 hover:border-amber-400/50 hover:bg-slate-600/50"
                      : "border-slate-600/50 bg-slate-700/40 hover:border-slate-500 hover:bg-slate-600/55"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-8 w-1 shrink-0 rounded-full bg-slate-500/80 transition-colors group-hover:bg-cyan-400/60" aria-hidden />
                    <span className={`min-w-0 flex-1 truncate text-sm font-semibold leading-snug ${loc.isReserve ? "text-amber-100" : "text-slate-100"}`}>
                      {loc.isReserve ? <span className="mr-1" aria-hidden>🔒</span> : null}
                      {loc.locationLabel}
                    </span>
                  </span>
                  <span className="pl-3 font-mono text-xs tabular-nums text-slate-400">
                    {loc.quantity} szt. w tej lokalizacji
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
