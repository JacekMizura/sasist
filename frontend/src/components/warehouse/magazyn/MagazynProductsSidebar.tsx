import type { RackState, WarehouseProduct } from "../../../types/warehouse";

export interface MagazynProductsSidebarProps {
  products: WarehouseProduct[];
  productSearchQuery: string;
  setProductSearchQuery: (v: string) => void;
  selectedLocationForProducts: { level_index: number; segment_index: number } | null;
  showAllProductsInSidebar: boolean;
  setShowAllProductsInSidebar: (v: boolean) => void;
  selectedRackForMagazyn: RackState | null;
  selectedRackBinUUIDs: Set<string>;
  selectedRackBinLabels: Set<string>;
  safeQuantity: (x: unknown) => number;
  safeVolumeDm3: (x: unknown) => number;
  getProductImageUrl: (p: WarehouseProduct) => string | null;
  formatVolume: (n: number) => string;
}

export function MagazynProductsSidebar({
  products,
  productSearchQuery,
  setProductSearchQuery,
  selectedLocationForProducts,
  showAllProductsInSidebar,
  setShowAllProductsInSidebar,
  selectedRackForMagazyn,
  selectedRackBinUUIDs,
  selectedRackBinLabels,
  safeQuantity,
  safeVolumeDm3,
  getProductImageUrl,
  formatVolume,
}: MagazynProductsSidebarProps) {
  const selectedBin = selectedLocationForProducts != null && selectedRackForMagazyn
    ? selectedRackForMagazyn.bins.find((b) => b.level_index === selectedLocationForProducts.level_index && b.segment_index === selectedLocationForProducts.segment_index)
    : null;
  const selectedBinLabel = selectedBin ? (selectedBin.label ?? selectedBin.location_id ?? "").trim() || null : null;
  const selectedBinUUID = selectedBin?.locationUUID ?? null;
  const filterToSingleBin = selectedBinLabel != null && !showAllProductsInSidebar;
  const baseList = selectedRackForMagazyn
    ? products.filter((p) => {
        if (filterToSingleBin) {
          if (p.assignedLocations?.length && selectedBinUUID) {
            return p.assignedLocations.some((a) => a.locationUUID === selectedBinUUID);
          }
          return p.location_id === selectedBinLabel;
        }
        if (p.assignedLocations?.length) {
          return p.assignedLocations.some((a) => selectedRackBinUUIDs.has(a.locationUUID));
        }
        return p.location_id != null && selectedRackBinLabels.has(p.location_id);
      })
    : [];
  const q = productSearchQuery.trim().toLowerCase();
  const list = q
    ? baseList.filter((p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.ean ?? "").toLowerCase().includes(q)
      )
    : baseList;
  const isReserveLocation = selectedBin?.storage_type === "reserve";

  return (
    <aside className="w-[300px] shrink-0 self-start flex-none flex flex-col h-fit max-h-[calc(100vh-200px)] overflow-y-auto bg-slate-800 border-l border-slate-700 rounded-r-xl overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-600 shrink-0">
        <h2 className="text-xs font-black uppercase text-slate-300">PRODUKTY W REGALE</h2>
        {/* Read-only in Magazyn: no Add/Edit – only in Projektant Layoutu */}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-none">
        <input
          type="text"
          value={productSearchQuery}
          onChange={(e) => setProductSearchQuery(e.target.value)}
          placeholder="Szukaj (nazwa, SKU)..."
          className="w-full rounded-lg border border-slate-600 bg-slate-700/50 text-slate-100 placeholder-slate-500 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
        />
        {selectedLocationForProducts != null && selectedRackForMagazyn && (
          <label className="flex items-center gap-2 text-slate-400 text-xs">
            <input
              type="checkbox"
              checked={showAllProductsInSidebar}
              onChange={(e) => setShowAllProductsInSidebar(e.target.checked)}
              className="rounded border-slate-500"
            />
            Pokaż wszystkie produkty
          </label>
        )}
        <div className="space-y-3 flex-none min-h-0">
          {filterToSingleBin && isReserveLocation && (
            <div className="flex items-center gap-1.5 rounded-lg bg-[#FFCC99] border border-amber-300 px-2 py-1.5 text-amber-900 text-xs">
              <span title="Lokalizacja zapasowa (Rezerwa)" aria-label="Lokalizacja zapasowa (Rezerwa)">🔒</span>
              <span>Lokalizacja zapasowa (Rezerwa)</span>
            </div>
          )}
          {list.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">
              {selectedRackForMagazyn ? "Brak produktów w tym regale" : "Brak produktów"}
            </p>
          ) : (
            list.map((p) => {
              const quantityAtLocation = filterToSingleBin && selectedBinUUID && p.assignedLocations?.length
                ? safeQuantity(p.assignedLocations.find((a) => a.locationUUID === selectedBinUUID)?.quantity ?? p.quantity)
                : safeQuantity(p.quantity);
              const volumeAtLocation = quantityAtLocation * safeVolumeDm3(p.volume_dm3);
              const imageUrl = getProductImageUrl(p);
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-3 shadow flex items-start gap-3 ${
                    isReserveLocation ? "border-amber-400 bg-slate-700/80 ring-1 ring-amber-400/50" : "border-slate-600 bg-slate-700/80"
                  }`}
                >
                  <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-slate-600 border border-slate-500">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover z-10"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100 break-words line-clamp-2">{p.name}</div>
                    <div className="text-xs text-slate-400 mt-1 truncate">SKU: {p.sku ?? "—"} · EAN: {p.ean ?? "—"}</div>
                    <div className="text-xs text-slate-300 mt-1">Sztuki: <span className="font-mono font-semibold text-slate-100">{quantityAtLocation}</span></div>
                    <div className="text-xs text-slate-300 mt-0.5">Objętość: <span className="font-mono font-semibold text-cyan-300">{formatVolume(volumeAtLocation)} dm³</span>{selectedBinLabel ? ` · ${selectedBinLabel}` : p.location_id ? ` · ${p.location_id}` : ""}</div>
                  </div>
                  {/* Magazyn view is read-only: no Edit / Remove from location buttons */}
                </div>
              );
            })
          )}
        </div>
      </div>
      {/* EditProductModal only openable from Layout (Widok z boku); not rendered in Magazyn */}
    </aside>
  );
}
