import { useMemo } from "react";
import type { LayoutState, WarehouseProduct } from "../../../types/warehouse";
import { compareLocationUuidsByLayoutOrder } from "../warehouseUtils";
import type { ProductLocationIndex } from "../../../pages/WarehouseDesigner/productLocationIndex";
import { buildUuidToResolvedLocation } from "../../../utils/resolvedWarehouseLocation";

export interface ProductLocatorSidebarProps {
  product: WarehouseProduct;
  totalQuantity: number;
  primaryQuantity: number;
  reserveQuantity: number;
  layout: LayoutState;
  /** Magazyn SSOT — inventory ∪ assigned for this layout only. */
  productLocationIndex: ProductLocationIndex;
  getProductImageUrl: (p: WarehouseProduct) => string | null;
  onSelectLocation: (locationUUID: string) => void;
}

export function ProductLocatorSidebar({
  product,
  totalQuantity,
  primaryQuantity,
  reserveQuantity,
  layout,
  productLocationIndex,
  getProductImageUrl,
  onSelectLocation,
}: ProductLocatorSidebarProps) {
  const uuidToResolved = useMemo(() => buildUuidToResolvedLocation(layout), [layout]);

  type LocationRow = { locationUUID: string; locationLabel: string; quantity: number; isReserve: boolean };

  const locations: LocationRow[] = useMemo(() => {
    const qtyByUuid = new Map<string, number>();
    for (const e of productLocationIndex.byProduct.get(product.id) ?? []) {
      if (e.quantity <= 0) continue;
      qtyByUuid.set(e.locationUUID, (qtyByUuid.get(e.locationUUID) ?? 0) + e.quantity);
    }
    return Array.from(qtyByUuid.entries())
      .map(([locUuid, qty]) => {
        const resolved = uuidToResolved.get(locUuid);
        return {
          locationUUID: locUuid,
          locationLabel: resolved?.label ?? locUuid,
          quantity: qty,
          isReserve: resolved?.storageType === "reserve",
        };
      })
      .filter((row) => row.locationLabel !== row.locationUUID || uuidToResolved.has(row.locationUUID))
      .sort((a, b) => {
        const q = b.quantity - a.quantity;
        if (q !== 0) return q;
        return compareLocationUuidsByLayoutOrder(layout, a.locationUUID, b.locationUUID);
      });
  }, [product.id, productLocationIndex, uuidToResolved, layout]);

  const imageUrl = getProductImageUrl(product);

  return (
    <aside
      className="flex h-full min-h-0 w-[360px] flex-none flex-col self-stretch overflow-hidden bg-[#f7f8fa] shadow-[-4px_0_24px_rgba(15,23,42,0.04)]"
      aria-label="Lokalizacja produktu"
    >
      <header className="shrink-0 px-5 pb-4 pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Lokalizacja</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Produkt</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60">
          <div className="flex items-start gap-3.5">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-white">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
                {product.name}
              </div>
              <div className="mt-1 truncate text-[11px] tracking-wide text-slate-400">{product.sku ?? "—"}</div>
              <div className="mt-0.5 truncate text-[11px] tracking-wide text-slate-400">
                EAN: {product.ean?.trim() ? product.ean : "—"}
              </div>
              <div className="mt-3 text-base font-semibold tabular-nums text-slate-900">
                {totalQuantity}
                <span className="ml-1 text-[12px] font-medium text-slate-400">szt.</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Podst. <span className="font-medium text-slate-600">{primaryQuantity}</span>
                {" · "}
                Rez. <span className="font-medium text-amber-700">{reserveQuantity}</span>
              </div>
            </div>
          </div>
        </div>

        <h3 className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Wszystkie lokalizacje
        </h3>
        <div className="max-h-[min(60vh,24rem)] space-y-2 overflow-y-auto pr-0.5">
          {locations.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Brak lokalizacji</p>
          ) : (
            locations.map((loc) => (
              <button
                key={loc.locationUUID}
                type="button"
                onClick={() => onSelectLocation(loc.locationUUID)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left transition-all duration-150 ${
                  loc.isReserve
                    ? "bg-amber-50/90 ring-1 ring-amber-200/80 hover:bg-amber-50"
                    : "bg-white shadow-sm ring-1 ring-slate-200/60 hover:shadow-md hover:ring-slate-300/80"
                }`}
              >
                <span className="min-w-0 truncate text-[13px] font-medium text-slate-800">{loc.locationLabel}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700">
                  {loc.quantity} szt.
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
