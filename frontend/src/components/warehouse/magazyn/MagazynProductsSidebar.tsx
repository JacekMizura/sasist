import { useState } from "react";
import { Link } from "react-router-dom";
import type { LayoutState, RackState, WarehouseProduct } from "../../../types/warehouse";

export interface MagazynProductsSidebarProps {
  layout: LayoutState;
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
  /** When true: rack selected on map; show top 5 + search, total/primary/reserve quantity, other locations = outside this rack. */
  rackProductMode?: boolean;
}

export function MagazynProductsSidebar({
  layout,
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
  rackProductMode = false,
}: MagazynProductsSidebarProps) {
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");

  type LocationRow = {
    locationUUID: string;
    locationLabel: string;
    quantity: number;
    storageType?: "primary" | "reserve";
  };

  function renderLocationRow(loc: LocationRow, idx: number) {
    const isReserve = loc.storageType === "reserve";
    return (
      <div
        key={loc.locationUUID}
        className={`flex justify-between text-xs ${isReserve ? "text-amber-300" : "text-slate-300"}`}
      >
        <span className="flex items-center gap-1 truncate min-w-0 mr-2">
          {isReserve && "🔒"}
          {loc.locationLabel}
        </span>
        <span className="font-mono shrink-0">{loc.quantity} szt.</span>
      </div>
    );
  }

  const uuidToLabel: Record<string, string> = {};
  for (const rack of layout.racks) {
    for (const bin of rack.bins ?? []) {
      if (bin.locationUUID != null && (bin.label != null || bin.location_id != null)) {
        uuidToLabel[bin.locationUUID] = (bin.label ?? bin.location_id ?? "").trim() || bin.locationUUID;
      }
    }
  }

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
  const searchFiltered = q
    ? baseList.filter((p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.ean ?? "").toLowerCase().includes(q)
      )
    : baseList;
  /** Rack (map) mode: show top 5 when no search; else show search-filtered list. */
  const list =
    rackProductMode && baseList.length > 5 && !q
      ? searchFiltered.slice(0, 5)
      : searchFiltered;
  const isReserveLocation = selectedBin?.storage_type === "reserve";
  const showSearchWhenMoreThan5 = rackProductMode && baseList.length > 5;

  return (
    <aside className="w-[300px] shrink-0 self-start flex-none flex flex-col h-fit max-h-[calc(100vh-200px)] overflow-y-auto bg-slate-800 border-l border-slate-700 rounded-r-xl overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-600 shrink-0">
        <h2 className="text-xs font-black uppercase text-slate-300">PRODUKTY W REGALE</h2>
        {/* Read-only in Magazyn: no Add/Edit – only in Projektant Layoutu */}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-none">
        {(showSearchWhenMoreThan5 || !rackProductMode) && (
          <input
            type="text"
            value={productSearchQuery}
            onChange={(e) => setProductSearchQuery(e.target.value)}
            placeholder="Szukaj (nazwa, SKU)..."
            className="w-full rounded-lg border border-slate-600 bg-slate-700/50 text-slate-100 placeholder-slate-500 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          />
        )}
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
              const currentLocation = p.assignedLocations?.find((a) => a.locationUUID === selectedBinUUID);
              const otherLocationsRaw =
                selectedBinUUID != null
                  ? (p.assignedLocations ?? []).filter((a) => a.locationUUID !== selectedBinUUID)
                  : (p.assignedLocations ?? []).filter((a) => !selectedRackBinUUIDs.has(a.locationUUID));
              const otherLocations: LocationRow[] = otherLocationsRaw
                .map((loc) => ({
                  locationUUID: loc.locationUUID,
                  locationLabel: loc.locationAddress ?? uuidToLabel[loc.locationUUID] ?? loc.locationUUID,
                  quantity: safeQuantity(loc.quantity),
                  storageType: loc.storageType,
                }))
                .sort((a, b) => {
                  const aReserve = a.storageType === "reserve" ? 1 : 0;
                  const bReserve = b.storageType === "reserve" ? 1 : 0;
                  if (aReserve !== bReserve) return aReserve - bReserve;
                  return b.quantity - a.quantity;
                });
              const quantityAtLocation = currentLocation
                ? safeQuantity(currentLocation.quantity)
                : filterToSingleBin && selectedBinUUID && p.assignedLocations?.length
                  ? safeQuantity(p.assignedLocations.find((a) => a.locationUUID === selectedBinUUID)?.quantity ?? p.quantity)
                  : safeQuantity(p.quantity);
              const enriched = p as WarehouseProduct & { totalQuantity?: number; primaryQuantity?: number; reserveQuantity?: number };
              const hasQuantityBreakdown = rackProductMode && enriched.totalQuantity != null;
              const volumeAtLocation = (hasQuantityBreakdown ? enriched.totalQuantity! : quantityAtLocation) * safeVolumeDm3(p.volume_dm3);
              const imageUrl = getProductImageUrl(p);
              const currentLocationLabel = currentLocation
                ? currentLocation.locationAddress ?? uuidToLabel[currentLocation.locationUUID] ?? currentLocation.locationUUID
                : null;
              const locationCount = otherLocations.length;
              const filteredLocations =
                locationCount > 20
                  ? otherLocations.filter((loc) =>
                      loc.locationLabel
                        .toLowerCase()
                        .includes(locationSearchQuery.trim().toLowerCase())
                    )
                  : otherLocations;
              const isExpanded = expandedProductId === p.id;

              return (
                <Link
                  key={p.id}
                  to={`/products/${p.id}`}
                  title={`Otwórz produkt: ${p.name}`}
                  className={`block cursor-pointer rounded-xl border p-3 shadow flex flex-col gap-0 transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                    isReserveLocation ? "border-amber-400 bg-slate-700/80 ring-1 ring-amber-400/50 hover:bg-slate-600/90" : "border-slate-600 bg-slate-700/80 hover:bg-slate-600/100"
                  }`}
                >
                  {currentLocation && (
                    <div className="mb-2 px-2 py-1 rounded border border-blue-400 bg-blue-900/20 text-blue-300 text-xs font-semibold">
                      Aktualna lokalizacja: {currentLocationLabel} — {safeQuantity(currentLocation.quantity)} szt.
                    </div>
                  )}
                  <div className="flex items-start gap-3">
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
                      {hasQuantityBreakdown ? (
                        <>
                          <div className="text-xs text-slate-300 mt-1">Sztuki łącznie: <span className="font-mono font-semibold text-slate-100">{enriched.totalQuantity}</span></div>
                          <div className="text-xs text-slate-400 mt-0.5">Podst. <span className="font-mono text-slate-300">{enriched.primaryQuantity ?? 0}</span> · Rez. <span className="font-mono text-amber-300">{enriched.reserveQuantity ?? 0}</span></div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-300 mt-1">Sztuki: <span className="font-mono font-semibold text-slate-100">{quantityAtLocation}</span></div>
                      )}
                      <div className="text-xs text-slate-300 mt-0.5">Objętość: <span className="font-mono font-semibold text-cyan-300">{formatVolume(volumeAtLocation)} dm³</span></div>
                      {otherLocations.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isExpanded) {
                              setLocationSearchQuery("");
                              setExpandedProductId(null);
                            } else {
                              setExpandedProductId(p.id);
                            }
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 mt-2"
                        >
                          Inne lokalizacje
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && otherLocations.length > 0 && (
                    <div className="mt-2 border-t border-slate-600 pt-2">
                      {locationCount > 20 && (
                        <input
                          type="text"
                          placeholder="Szukaj lokalizacji..."
                          value={locationSearchQuery}
                          onChange={(e) => setLocationSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="w-full mb-2 px-2 py-1 text-sm rounded bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                        />
                      )}
                      {locationCount <= 5 ? (
                        <div className="space-y-1">
                          {filteredLocations.map((loc, idx) => renderLocationRow(loc, idx))}
                        </div>
                      ) : (
                        <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
                          {filteredLocations.length > 0 ? (
                            filteredLocations.map((loc, idx) => renderLocationRow(loc, idx))
                          ) : (
                            <div className="text-xs text-slate-400 py-2">
                              Brak wyników
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </div>
      {/* EditProductModal only openable from Layout (Widok z boku); not rendered in Magazyn */}
    </aside>
  );
}
