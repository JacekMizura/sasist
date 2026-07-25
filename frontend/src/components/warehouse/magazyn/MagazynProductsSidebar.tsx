import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { brandLinkTextClass } from "../../../design-system/brandUi";
import type { LayoutState, NormalizedStorageType, RackState, WarehouseProduct } from "../../../types/warehouse";
import { getProductDetailsPath } from "../../../pages/Products/productPaths";
import { ConfirmModal } from "../../ui/ConfirmModal";
import { activeBinsForRack, compareLocationUuidsByLayoutOrder } from "../warehouseUtils";
import { resolveWarehouseLocation } from "../../../utils/resolvedWarehouseLocation";
import { normalizeInventoryLocationUuid, type InventoryMaps } from "../../../pages/WarehouseDesigner/inventoryMaps";
import {
  binLocationUuid,
  productIdsAtLocation,
  productIdsOnRack,
  type ProductLocationIndex,
} from "../../../pages/WarehouseDesigner/productLocationIndex";
import { normalizeStorageType } from "../../../utils/storageTypes";

function assignedLocationEntryUuid(a: {
  locationUUID?: string;
  location_uuid?: string;
}): string | undefined {
  if (typeof a.locationUUID === "string" && a.locationUUID.trim() !== "") return a.locationUUID.trim();
  if (typeof a.location_uuid === "string" && a.location_uuid.trim() !== "") return a.location_uuid.trim();
  return undefined;
}

function productHasAssignmentAt(p: WarehouseProduct, locationUUID: string): boolean {
  const u = locationUUID.trim();
  if (!u || !p.assignedLocations?.length) return false;
  return p.assignedLocations.some((a) => assignedLocationEntryUuid(a) === u);
}

type LocationRowSortable = {
  locationLabel: string;
  locationUUID?: string;
  storageType?: NormalizedStorageType;
  quantity: number;
};

/** Sort by layout walk order (UUID), then label; reserve/qty tie-break. RTL-safe. */
function sortOtherLocationsForDisplay<T extends LocationRowSortable>(rows: T[], layout: LayoutState): T[] {
  const indexed = rows.map((loc, i) => ({ loc, i }));
  indexed.sort((a, b) => {
    const uA = a.loc.locationUUID?.trim();
    const uB = b.loc.locationUUID?.trim();
    if (uA && uB) {
      const c = compareLocationUuidsByLayoutOrder(layout, uA, uB);
      if (c !== 0) return c;
    } else if (uA && !uB) return -1;
    else if (!uA && uB) return 1;
    const la = a.loc.locationLabel.trim();
    const lb = b.loc.locationLabel.trim();
    const cmp = la.localeCompare(lb, undefined, { numeric: true });
    if (cmp !== 0) return cmp;
    const aReserve = a.loc.storageType === "reserve" ? 1 : 0;
    const bReserve = b.loc.storageType === "reserve" ? 1 : 0;
    if (aReserve !== bReserve) return aReserve - bReserve;
    const q = b.loc.quantity - a.loc.quantity;
    if (q !== 0) return q;
    return a.i - b.i;
  });
  return indexed.map((x) => x.loc);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Visual-only: case-insensitive matches wrapped in `mark` (preserves original casing). */
function highlightQueryInText(text: string, query: string, keyPrefix: string): ReactNode {
  const q = query.trim();
  const raw = text ?? "";
  if (!q) return raw;
  try {
    const parts = raw.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
    if (parts.length === 1) return raw;
    return (
      <>
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <mark
              key={`${keyPrefix}-m-${i}`}
              className="rounded-sm bg-cyan-400/35 text-inherit px-0.5 py-0 [box-decoration-break:clone]"
            >
              {part}
            </mark>
          ) : (
            <span key={`${keyPrefix}-t-${i}`}>{part}</span>
          )
        )}
      </>
    );
  } catch {
    return raw;
  }
}

/** Higher = stronger match (only used after substring filter). */
function productSearchRank(p: WarehouseProduct, q: string): number {
  if (!q) return 0;
  const name = (p.name ?? "").toLowerCase();
  const sku = (p.sku ?? "").toLowerCase();
  const ean = (p.ean ?? "").toLowerCase();
  if (name.startsWith(q)) return 100;
  if (sku.startsWith(q)) return 90;
  if (ean.startsWith(q)) return 88;
  if (name.includes(q)) return 70;
  if (sku.includes(q)) return 55;
  if (ean.includes(q)) return 50;
  return 0;
}

/** Polish plural: 1 → produkt, 2–4 → produkty, 5+ (and 0) → produktów. */
function formatProduktCount(n: number): string {
  if (n === 1) return "1 produkt";
  if (n >= 2 && n <= 4) return `${n} produkty`;
  return `${n} produktów`;
}

export interface MagazynProductsSidebarProps {
  layout: LayoutState;
  products: WarehouseProduct[];
  /** Magazyn SSOT — inventory ∪ assigned (layout-scoped). Required for consistent lists. */
  productLocationIndex: ProductLocationIndex;
  inventoryMaps: InventoryMaps | null;
  productSearchQuery: string;
  setProductSearchQuery: (v: string) => void;
  selectedLocationForProducts: { level_index: number; segment_index: number } | null;
  showAllProductsInSidebar: boolean;
  setShowAllProductsInSidebar: (v: boolean) => void;
  selectedRackForMagazyn: RackState | null;
  selectedRackBinUUIDs: Set<string>;
  safeQuantity: (x: unknown) => number;
  safeVolumeDm3: (x: unknown) => number;
  getProductImageUrl: (p: WarehouseProduct) => string | null;
  formatVolume: (n: number) => string;
  /** When true: rack selected on map; show top 5 + search, total/primary/reserve quantity, other locations = outside this rack. */
  rackProductMode?: boolean;
  /** Optional: notify parent about product hover (for rack highlight on map). */
  onHoverProductIdChange?: (productId: string | null) => void;
  /** Optional: hover over a location row (inventory / assignment UUID) → highlight that bin on the top-down map. */
  onHoverLocationUUIDChange?: (locationUUID: string | null) => void;
  /** Remove one assigned_locations entry (PATCH product); inventory rows are not synced when backend supports skip_inventory_sync. */
  onRemoveProductAssignment?: (productId: string, locationUUID: string) => Promise<void>;
  /** Opens parent clear-rack confirmation (same flow as rack header). */
  onRequestClearRack?: () => void;
  /** While parent clears assignments for the rack. */
  clearRackBusy?: boolean;
  /** Full product list for assignment checks when `products` is filtered (e.g. map rack mode). */
  productsForRackAssignmentCheck?: WarehouseProduct[];
  /** Map highlight: which product’s bins are shown on the warehouse canvas. */
  selectedProductId?: string | null;
  /** Toggle bin highlight on map; same id again clears. Ctrl/Cmd+click keeps default navigation to product. */
  onToggleProductMapHighlight?: (productId: string) => void;
  /** Open damage protocol prefilled with currently shown damaged location/product. */
  onCreateDamageReportPrefill?: (prefill: { productId: number; locationUUID: string; quantity?: number }) => void;
}

export function MagazynProductsSidebar({
  layout,
  products,
  productLocationIndex,
  inventoryMaps: _inventoryMaps,
  productSearchQuery,
  setProductSearchQuery,
  selectedLocationForProducts,
  showAllProductsInSidebar,
  setShowAllProductsInSidebar,
  selectedRackForMagazyn,
  selectedRackBinUUIDs,
  safeQuantity,
  safeVolumeDm3,
  getProductImageUrl,
  formatVolume,
  rackProductMode = false,
  onHoverProductIdChange,
  onHoverLocationUUIDChange,
  onRemoveProductAssignment,
  onRequestClearRack,
  clearRackBusy = false,
  productsForRackAssignmentCheck,
  selectedProductId = null,
  onToggleProductMapHighlight,
  onCreateDamageReportPrefill,
}: MagazynProductsSidebarProps) {
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [confirmRemoveAssignment, setConfirmRemoveAssignment] = useState<{
    productId: string;
    locationUUID: string;
    label: string;
    productName?: string;
  } | null>(null);
  const [assignmentRemovingKey, setAssignmentRemovingKey] = useState<string | null>(null);

  type LocationRow = {
    locationUUID: string;
    locationLabel: string;
    quantity: number;
    storageType?: NormalizedStorageType;
  };

  function getLocationTypeBadge(storageType?: NormalizedStorageType): { icon: string; label: string; className: string } | null {
    const normalized = storageType ?? "unknown";
    if (normalized === "reserve") {
      return {
        icon: "🔒",
        label: "Lokalizacja zapasowa (Rezerwa)",
        className: "bg-[#FFCC99] border border-amber-300 text-amber-900",
      };
    }
    if (normalized === "damaged") {
      return {
        icon: "⚠️",
        label: "Lokalizacja na uszkodzone",
        className: "bg-red-100 border border-red-300 text-red-800",
      };
    }
    return null;
  }

  function renderLocationRow(product: WarehouseProduct, loc: LocationRow) {
    const typeBadge = getLocationTypeBadge(loc.storageType);
    const removeKey = `${product.id}|${loc.locationUUID}`;
    const showRemove = Boolean(onRemoveProductAssignment) && productHasAssignmentAt(product, loc.locationUUID);
    const busy = assignmentRemovingKey === removeKey;
    const su = normalizeInventoryLocationUuid(loc.locationUUID);
    const suBin = selectedBinUUID ? normalizeInventoryLocationUuid(selectedBinUUID) : "";
    const isSlotSelected = suBin !== "" && su !== "" && su === suBin;
    return (
      <div
        key={loc.locationUUID}
        role="presentation"
        onMouseEnter={() => onHoverLocationUUIDChange?.(loc.locationUUID)}
        onMouseLeave={() => onHoverLocationUUIDChange?.(null)}
        className={`group flex w-full cursor-default items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-all duration-150 ${
          isSlotSelected
            ? "bg-orange-50 text-slate-900 ring-1 ring-orange-300/70"
            : typeBadge != null
              ? "bg-amber-50/80 text-amber-950 ring-1 ring-amber-200/70 hover:bg-amber-50"
            : "bg-white text-slate-700 ring-1 ring-slate-200/70 hover:shadow-sm"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-8 w-1 shrink-0 rounded-full bg-slate-300 transition-colors duration-150 group-hover:bg-orange-400" aria-hidden />
          <span className="min-w-0 truncate">
            {typeBadge?.icon ? <span className="mr-1">{typeBadge.icon}</span> : null}
            <span className="font-medium">{loc.locationLabel}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-800 ring-1 ring-slate-200/80">
            {loc.quantity} szt.
          </span>
          {showRemove && (
            <button
              type="button"
              aria-label="Usuń przypisanie do tej lokalizacji"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirmRemoveAssignment({
                  productId: product.id,
                  locationUUID: loc.locationUUID,
                  label: loc.locationLabel,
                  productName: product.name,
                });
              }}
              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </span>
      </div>
    );
  }

  /** UUID → resolved label (single source of truth with badge type). */
  const uuidToResolved = useMemo(() => {
    const labels: Record<string, string> = {};
    const types = new Map<string, NormalizedStorageType>();
    for (const rack of layout.racks) {
      for (const bin of activeBinsForRack(rack)) {
        const u = binLocationUuid(bin);
        if (!u) continue;
        const resolved = resolveWarehouseLocation(rack, bin, layout);
        labels[u] = resolved.label;
        types.set(u, resolved.storageType);
      }
    }
    return { labels, types };
  }, [layout]);
  const uuidToDisplayLabel = uuidToResolved.labels;

  const selectedBin = selectedLocationForProducts != null && selectedRackForMagazyn
    ? selectedRackForMagazyn.bins.find((b) => b.level_index === selectedLocationForProducts.level_index && b.segment_index === selectedLocationForProducts.segment_index)
    : null;
  const selectedBinLabel =
    selectedBin && selectedRackForMagazyn
      ? resolveWarehouseLocation(selectedRackForMagazyn, selectedBin, layout).label
      : null;
  const selectedBinUUID = selectedBin ? binLocationUuid(selectedBin) || null : null;
  const filterToSingleBin = selectedBinLabel != null && !showAllProductsInSidebar;
  const rackKey = selectedRackForMagazyn ? String(selectedRackForMagazyn.id ?? selectedRackForMagazyn.rack_index) : null;

  const uuidToStorageType = useMemo(() => {
    const map = new Map<string, NormalizedStorageType>(uuidToResolved.types);
    for (const rack of layout.racks) {
      for (const bin of activeBinsForRack(rack)) {
        const u = binLocationUuid(bin);
        if (!u || map.has(u)) continue;
        map.set(u, resolveWarehouseLocation(rack, bin, layout).storageType);
      }
    }
    return map;
  }, [layout.racks, layout, uuidToResolved.types]);

  const productsCheckedForRackAssignments = productsForRackAssignmentCheck ?? products;
  const hasAssignedProductsOnRack = useMemo(() => {
    if (!selectedRackForMagazyn || !rackKey) return false;
    if ((productLocationIndex.byRack.get(rackKey)?.length ?? 0) > 0) return true;
    if (selectedRackBinUUIDs.size === 0) return false;
    return productsCheckedForRackAssignments.some((p) =>
      p.assignedLocations?.some((a) => {
        const u = assignedLocationEntryUuid(a);
        return u != null && selectedRackBinUUIDs.has(u);
      })
    );
  }, [
    productsCheckedForRackAssignments,
    selectedRackBinUUIDs,
    selectedRackForMagazyn,
    rackKey,
    productLocationIndex,
  ]);

  /** Products on selected rack / bin — SSOT index only (inventory ∪ assigned). */
  const baseList = useMemo(() => {
    if (!selectedRackForMagazyn || !rackKey) return [];
    if (rackProductMode) return products;
    const ids =
      filterToSingleBin && selectedBinUUID
        ? productIdsAtLocation(productLocationIndex, selectedBinUUID)
        : productIdsOnRack(productLocationIndex, rackKey);
    return products.filter((p) => ids.has(p.id));
  }, [
    selectedRackForMagazyn,
    rackKey,
    rackProductMode,
    products,
    filterToSingleBin,
    selectedBinUUID,
    productLocationIndex,
  ]);

  /**
   * Full-rack product list for summary: map mode uses products (parent's 
ackProductsForMap);
   * otherwise rack-wide ids from SSOT (never inventory-only).
   */
  const rackWideBaseList = useMemo(() => {
    if (!selectedRackForMagazyn || !rackKey) return [];
    if (rackProductMode) return products;
    if (!filterToSingleBin) return baseList;
    const ids = productIdsOnRack(productLocationIndex, rackKey);
    return products.filter((p) => ids.has(p.id));
  }, [
    selectedRackForMagazyn,
    rackKey,
    rackProductMode,
    products,
    filterToSingleBin,
    baseList,
    productLocationIndex,
  ]);

  const rackSummaryStats = useMemo(() => {
    const uniqueProductsCount = rackWideBaseList.length;
    if (uniqueProductsCount === 0) return { uniqueProductsCount: 0, totalQuantity: 0 };

    if (rackProductMode) {
      let totalQuantity = 0;
      for (const p of rackWideBaseList) {
        const en = p as WarehouseProduct & { totalQuantity?: number };
        totalQuantity += safeQuantity(en.totalQuantity);
      }
      return { uniqueProductsCount, totalQuantity };
    }

    if (!rackKey) return { uniqueProductsCount, totalQuantity: 0 };
    let totalQuantity = 0;
    for (const e of productLocationIndex.byRack.get(rackKey) ?? []) {
      totalQuantity += e.quantity;
    }
    return { uniqueProductsCount, totalQuantity };
  }, [rackWideBaseList, rackProductMode, rackKey, productLocationIndex, safeQuantity]);

  /**
   * Single derivation: whitespace-only query counts as empty → always default view (map: top 5 when >5 items, else full baseList).
   * Non-empty → filtered + relevance sort only (never mix with default slice).
   */
  const list = useMemo(() => {
    const trimmed = productSearchQuery.trim();
    if (trimmed.length === 0) {
      if (rackProductMode && baseList.length > 5) return baseList.slice(0, 5);
      return baseList;
    }
    const raw = trimmed.toLowerCase();
    const matched = baseList.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(raw) ||
        (p.sku ?? "").toLowerCase().includes(raw) ||
        (p.ean ?? "").toLowerCase().includes(raw)
    );
    return [...matched].sort((a, b) => {
      const d = productSearchRank(b, raw) - productSearchRank(a, raw);
      if (d !== 0) return d;
      return (a.name ?? "").localeCompare(b.name ?? "", "pl", { sensitivity: "base" });
    });
  }, [baseList, productSearchQuery, rackProductMode]);
  const selectedLocationBadge = getLocationTypeBadge(
    selectedBin && selectedRackForMagazyn
      ? resolveWarehouseLocation(selectedRackForMagazyn, selectedBin, layout).storageType
      : undefined,
  );

  return (
    <aside className="flex h-full min-h-0 w-[360px] flex-none flex-col self-stretch overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[#f7f8fa] shadow-[-4px_0_24px_rgba(15,23,42,0.04)] designer-rail-scroll">
      <div className="flex shrink-0 flex-col gap-3 px-5 pb-4 pt-5">
        {selectedRackForMagazyn && onRequestClearRack && hasAssignedProductsOnRack && (
          <button
            type="button"
            onClick={onRequestClearRack}
            disabled={clearRackBusy}
            className="w-full rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Opróżnij regał
          </button>
        )}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Regał</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Produkty</h2>
        </div>
        <input
          type="text"
          value={productSearchQuery}
          onChange={(e) => setProductSearchQuery(e.target.value)}
          placeholder="Szukaj nazwy lub SKU…"
          className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-slate-200/80 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
        />
        {selectedRackForMagazyn && (
          <p className="text-[11px] leading-snug text-slate-500">
            {rackSummaryStats.uniqueProductsCount === 0 || rackSummaryStats.totalQuantity === 0
              ? "Brak produktów"
              : `${formatProduktCount(rackSummaryStats.uniqueProductsCount)} • ${rackSummaryStats.totalQuantity} szt.`}
          </p>
        )}
      </div>
      <div className="flex flex-none flex-col gap-3 px-4 pb-6">
        {selectedLocationForProducts != null && selectedRackForMagazyn && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showAllProductsInSidebar}
              onChange={(e) => setShowAllProductsInSidebar(e.target.checked)}
              className="rounded border-slate-300 text-orange-500 focus:ring-orange-400/40"
            />
            Pokaż wszystkie produkty
          </label>
        )}
        <div className="min-h-0 flex-none space-y-3">          {filterToSingleBin && selectedLocationBadge != null && (
            <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${selectedLocationBadge.className}`}>
              <span aria-label={selectedLocationBadge.label}>{selectedLocationBadge.icon}</span>
              <span>{selectedLocationBadge.label}</span>
            </div>
          )}
          {list.length === 0 ? (
            <div className="space-y-1.5 px-0.5 py-4 text-center text-sm text-slate-400" role="status">
              <p>
                {productSearchQuery.trim().length > 0
                  ? "Brak produktów"
                  : selectedRackForMagazyn
                    ? "Brak produktów w tym regale"
                    : "Brak produktów"}
              </p>
              {productSearchQuery.trim().length > 0 ? (
                <p className="text-xs text-slate-500 break-words">
                  Szukano: „{productSearchQuery.trim()}”
                </p>
              ) : null}
            </div>
          ) : (
            list.map((p) => {
              let currentLocation: LocationRow | null = null;
              let otherLocations: LocationRow[] = [];
              let quantityAtLocation = 0;

              const productEntries = productLocationIndex.byProduct.get(p.id) ?? [];
              const qtyByLoc = new Map<string, number>();
              for (const e of productEntries) {
                if (e.quantity <= 0) continue;
                qtyByLoc.set(e.locationUUID, (qtyByLoc.get(e.locationUUID) ?? 0) + e.quantity);
              }

              const selectedSu = selectedBinUUID ? normalizeInventoryLocationUuid(selectedBinUUID) : '';
              if (filterToSingleBin && selectedBinLabel && selectedSu) {
                const qtyAtSelected = qtyByLoc.get(selectedSu) ?? 0;
                if (qtyAtSelected > 0) {
                  currentLocation = {
                    locationUUID: selectedSu,
                    locationLabel: uuidToDisplayLabel[selectedSu] || selectedBinLabel || selectedSu,
                    quantity: qtyAtSelected,
                    storageType: uuidToStorageType.get(selectedSu),
                  };
                }
                quantityAtLocation = qtyAtSelected;
                otherLocations = sortOtherLocationsForDisplay(
                  Array.from(qtyByLoc.entries())
                    .filter(([u]) => u !== selectedSu)
                    .map(([ck, qty]) => ({
                      locationUUID: ck,
                      locationLabel: uuidToDisplayLabel[ck] ?? ck,
                      quantity: qty,
                      storageType: uuidToStorageType.get(ck),
                    })),
                  layout
                );
              } else {
                let rackTotalQty = 0;
                for (const e of productEntries) {
                  if (rackKey && e.rackId === rackKey) rackTotalQty += e.quantity;
                }
                if (rackProductMode) {
                  const enrichedQty = (p as WarehouseProduct & { totalQuantity?: number }).totalQuantity;
                  quantityAtLocation = enrichedQty != null ? safeQuantity(enrichedQty) : rackTotalQty;
                } else {
                  quantityAtLocation = rackTotalQty;
                }
                otherLocations = sortOtherLocationsForDisplay(
                  Array.from(qtyByLoc.entries()).map(([ck, qty]) => ({
                    locationUUID: ck,
                    locationLabel: uuidToDisplayLabel[ck] ?? ck,
                    quantity: qty,
                    storageType: uuidToStorageType.get(ck),
                  })),
                  layout
                );
              }

              const enriched = p as WarehouseProduct & { totalQuantity?: number; primaryQuantity?: number; reserveQuantity?: number };
              const hasQuantityBreakdown = rackProductMode && enriched.totalQuantity != null;
              const volumeAtLocation = (hasQuantityBreakdown ? enriched.totalQuantity! : quantityAtLocation) * safeVolumeDm3(p.volume_dm3);
              const imageUrl = getProductImageUrl(p);
              const currentLocationLabel = currentLocation ? currentLocation.locationLabel : null;
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
              const isReserveLocation =
                (hasQuantityBreakdown && (enriched.reserveQuantity ?? 0) > 0) ||
                normalizeStorageType(currentLocation?.storageType) === "reserve";

              return (
                <Link
                  key={p.id}
                  to={getProductDetailsPath(p.id)}
                  onClick={(e) => {
                    if (!onToggleProductMapHighlight) return;
                    if (e.ctrlKey || e.metaKey) return;
                    e.preventDefault();
                    onToggleProductMapHighlight(p.id);
                  }}
                  onMouseEnter={() => onHoverProductIdChange?.(p.id)}
                  onMouseLeave={() => onHoverProductIdChange?.(null)}
                  className={`block cursor-pointer rounded-2xl bg-white p-4 shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-orange-400/40 ${
                    isReserveLocation
                      ? "ring-1 ring-amber-300/70 hover:shadow-md"
                      : "ring-1 ring-slate-200/60 hover:shadow-md hover:ring-slate-300/80"
                  } ${
                    selectedProductId === p.id && onToggleProductMapHighlight ? "ring-2 ring-orange-400/50" : ""
                  }`}
                >
                  {currentLocation && (
                    <div
                      className="mb-3 flex items-center justify-between gap-1.5 rounded-xl bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800"
                      onMouseEnter={() => onHoverLocationUUIDChange?.(currentLocation.locationUUID)}
                      onMouseLeave={() => onHoverLocationUUIDChange?.(null)}
                    >
                      <span className="min-w-0">
                        {currentLocationLabel} — {safeQuantity(currentLocation.quantity)} szt.
                      </span>
                      {normalizeStorageType(currentLocation.storageType) === "damaged" && onCreateDamageReportPrefill ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const locationUUID = currentLocation.locationUUID?.trim();
                            const productIdNum = Number(p.id);
                            if (!locationUUID || !Number.isFinite(productIdNum)) return;
                            onCreateDamageReportPrefill({
                              productId: productIdNum,
                              locationUUID,
                              quantity: Math.max(1, Math.floor(safeQuantity(currentLocation.quantity))),
                            });
                          }}
                          className="rounded-lg bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-200"
                        >
                          Utwórz protokół szkody
                        </button>
                      ) : null}
                      {onRemoveProductAssignment &&
                        selectedBinUUID &&
                        productHasAssignmentAt(p, selectedBinUUID) && (
                          <button
                            type="button"
                            aria-label="Usuń przypisanie do tej lokalizacji"
                            disabled={assignmentRemovingKey === `${p.id}|${selectedBinUUID}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfirmRemoveAssignment({
                                productId: p.id,
                                locationUUID: selectedBinUUID,
                                label: currentLocationLabel ?? selectedBinUUID,
                                productName: p.name,
                              });
                            }}
                            className="shrink-0 rounded-lg p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                    </div>
                  )}
                  <div className="flex items-start gap-3.5">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-white">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-contain"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-words text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
                        {highlightQueryInText(p.name ?? "", productSearchQuery, p.id)}
                      </div>
                      <div className="mt-1 truncate text-[11px] tracking-wide text-slate-400">{p.sku ?? "—"}</div>
                      <div className="mt-0.5 truncate text-[11px] tracking-wide text-slate-400">
                        EAN: {p.ean?.trim() ? p.ean : "—"}
                      </div>
                      {hasQuantityBreakdown ? (
                        <>
                          <div className="mt-3 text-base font-semibold tabular-nums text-slate-900">
                            {enriched.totalQuantity}
                            <span className="ml-1 text-[12px] font-medium text-slate-400">szt.</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            Podst. <span className="font-medium text-slate-600">{enriched.primaryQuantity ?? 0}</span>
                            {" · "}
                            Rez. <span className="font-medium text-amber-700">{enriched.reserveQuantity ?? 0}</span>
                          </div>
                        </>
                      ) : (
                        <div className="mt-3 text-base font-semibold tabular-nums text-slate-900">
                          {quantityAtLocation}
                          <span className="ml-1 text-[12px] font-medium text-slate-400">szt.</span>
                        </div>
                      )}
                      <div className="mt-2">
                        <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-sky-700">
                          {formatVolume(volumeAtLocation)} dm³
                        </span>
                      </div>
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
                          className={`mt-2 text-[11px] ${brandLinkTextClass}`}
                        >
                          Inne lokalizacje
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && otherLocations.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {locationCount > 20 && (
                        <input
                          type="text"
                          placeholder="Szukaj lokalizacji..."
                          value={locationSearchQuery}
                          onChange={(e) => setLocationSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="mb-2 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200/80 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                        />
                      )}
                      {locationCount <= 5 ? (
                        <div className="space-y-2">
                          {filteredLocations.map((loc) => renderLocationRow(p, loc))}
                        </div>
                      ) : (
                        <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                          {filteredLocations.length > 0 ? (
                            filteredLocations.map((loc) => renderLocationRow(p, loc))
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
      {confirmRemoveAssignment != null && onRemoveProductAssignment && (
        <ConfirmModal
          title="Usuń przypisanie"
          message={
            <>
              <p>Czy na pewno chcesz usunąć produkt z tej lokalizacji?</p>
              <p className="mt-2 text-xs text-slate-400 truncate">
                {confirmRemoveAssignment.label}
              </p>
              {confirmRemoveAssignment.productName ? (
                <p className="mt-1 text-xs text-slate-500 truncate">
                  {confirmRemoveAssignment.productName}
                </p>
              ) : null}
            </>
          }
          onCancel={() => {
            if (assignmentRemovingKey == null) setConfirmRemoveAssignment(null);
          }}
          pending={assignmentRemovingKey != null}
          onConfirm={async () => {
            const { productId, locationUUID } = confirmRemoveAssignment;
            const rk = `${productId}|${locationUUID}`;
            setAssignmentRemovingKey(rk);
            try {
              await onRemoveProductAssignment(productId, locationUUID);
              setConfirmRemoveAssignment(null);
            } catch (err) {
              console.error(err);
              alert("Nie udało się usunąć przypisania. Spróbuj ponownie.");
            } finally {
              setAssignmentRemovingKey(null);
            }
          }}
        />
      )}
    </aside>
  );
}
