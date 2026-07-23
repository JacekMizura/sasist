import { useMemo, useState, type ReactNode } from "react";
import { warn } from "../../../utils/logger";
import { Link } from "react-router-dom";
import type { LayoutState, NormalizedStorageType, RackState, WarehouseProduct } from "../../../types/warehouse";
import { getProductDetailsPath } from "../../../pages/Products/productPaths";
import { ConfirmModal } from "../../ui/ConfirmModal";
import { activeBinsForRack, compareLocationUuidsByLayoutOrder } from "../warehouseUtils";
import { resolveWarehouseLocation } from "../../../utils/resolvedWarehouseLocation";
import { normalizeInventoryLocationUuid, type InventoryMaps, type InventoryRow } from "../../../pages/WarehouseDesigner/inventoryMaps";
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

/** Display-only: collapse whitespace in location labels (not used for matching). */
function normDisplayLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** Match stock row to a bin by inventory.location_uuid ↔ bin.locationUUID. */
function invRowMatchesBin(inv: InventoryRow, binUuid: string): boolean {
  const iu = normalizeInventoryLocationUuid(inv.location_uuid);
  return iu !== "" && iu === binUuid;
}

function invRowIsFocusedBin(inv: InventoryRow, focusUuid: string | null): boolean {
  if (!focusUuid) return false;
  const iu = normalizeInventoryLocationUuid(inv.location_uuid);
  return iu !== "" && iu === focusUuid;
}

/** Canonical key for aggregating stock by location (UUID only). */
function inventoryRowCanonicalLocKey(inv: InventoryRow): string {
  return normalizeInventoryLocationUuid(inv.location_uuid);
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
  inventoryMaps,
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
        className={`group flex w-full cursor-default items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs transition-all duration-150 ${
          isSlotSelected
            ? "border-cyan-400/70 bg-cyan-950/35 text-slate-50 shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_6px_16px_rgba(15,23,42,0.35)]"
            : typeBadge != null
              ? "border-amber-500/25 bg-slate-800/50 text-amber-100 hover:border-amber-400/40 hover:bg-slate-700/70 hover:shadow-md"
              : "border-slate-600/40 bg-slate-800/35 text-slate-200 hover:border-slate-500/60 hover:bg-slate-700/65 hover:shadow-md"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-8 w-1 shrink-0 rounded-full bg-slate-500/80 transition-colors duration-150 group-hover:bg-cyan-400/70" aria-hidden />
          <span className="min-w-0 truncate">
            {typeBadge?.icon ? <span className="mr-1">{typeBadge.icon}</span> : null}
            <span className="font-medium">{loc.locationLabel}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-md bg-slate-900/40 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-slate-100 ring-1 ring-slate-600/50">
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
              className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-900/60 hover:text-red-300 disabled:opacity-40"
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
        const u = (bin.locationUUID ?? "").trim();
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
  const selectedBinUUID = selectedBin?.locationUUID ?? null;
  const filterToSingleBin = selectedBinLabel != null && !showAllProductsInSidebar;
  const usingInventory = inventoryMaps != null;
  const rackKey = selectedRackForMagazyn ? String(selectedRackForMagazyn.id ?? selectedRackForMagazyn.rack_index) : null;

  const uuidToStorageType = useMemo(() => {
    const map = new Map<string, NormalizedStorageType>(uuidToResolved.types);
    for (const rack of layout.racks) {
      for (const bin of activeBinsForRack(rack)) {
        const u = (bin.locationUUID ?? "").trim();
        if (!u || map.has(u)) continue;
        map.set(u, resolveWarehouseLocation(rack, bin, layout).storageType);
      }
    }
    return map;
  }, [layout.racks]);

  const productsCheckedForRackAssignments = productsForRackAssignmentCheck ?? products;
  const hasAssignedProductsOnRack = useMemo(() => {
    if (!selectedRackForMagazyn || selectedRackBinUUIDs.size === 0) return false;
    return productsCheckedForRackAssignments.some((p) =>
      p.assignedLocations?.some((a) => {
        const u = assignedLocationEntryUuid(a);
        return u != null && selectedRackBinUUIDs.has(u);
      })
    );
  }, [productsCheckedForRackAssignments, selectedRackBinUUIDs, selectedRackForMagazyn]);

  const baseList = selectedRackForMagazyn
    ? rackProductMode
      ? products
      : usingInventory
        ? (() => {
            const productIdsInScope = new Set<string>();
            if (filterToSingleBin && selectedBinLabel) {
              const su = normalizeInventoryLocationUuid(selectedBinUUID);
              if (su) {
                const invByUuid = inventoryMaps!.byLocationUuid.get(su) ?? [];
                for (const inv of invByUuid) {
                  if (safeQuantity(inv.quantity) <= 0) continue;
                  productIdsInScope.add(String(inv.product_id));
                }
              }
            } else if (rackKey) {
              const invRows = inventoryMaps!.byRackId.get(rackKey) ?? [];
              for (const inv of invRows) {
                if (safeQuantity(inv.quantity) <= 0) continue;
                productIdsInScope.add(String(inv.product_id));
              }
            }
            return products.filter((p) => productIdsInScope.has(p.id));
          })()
        : products.filter((p) => {
            if (filterToSingleBin) {
              if (p.assignedLocations?.length && selectedBinUUID) {
                return p.assignedLocations.some((a) => assignedLocationEntryUuid(a) === selectedBinUUID);
              }
              return false;
            }
            if (p.assignedLocations?.length) {
              return p.assignedLocations.some((a) => {
                const u = assignedLocationEntryUuid(a);
                return u != null && selectedRackBinUUIDs.has(u);
              });
            }
            return false;
          })
    : [];

  /**
   * Full-rack product list for summary: map mode uses `products` (parent's `rackProductsForMap`);
   * otherwise reuse `baseList` when it is already rack-wide (`!filterToSingleBin`), else same rack-wide rules as `baseList` without bin filter.
   */
  const rackWideBaseList = useMemo(() => {
    if (!selectedRackForMagazyn) return [];
    if (rackProductMode) return products;
    if (!filterToSingleBin) return baseList;
    if (usingInventory) {
      const productIdsInScope = new Set<string>();
      if (rackKey) {
        const invRows = inventoryMaps!.byRackId.get(rackKey) ?? [];
        for (const inv of invRows) {
          if (safeQuantity(inv.quantity) <= 0) continue;
          productIdsInScope.add(String(inv.product_id));
        }
      }
      return products.filter((p) => productIdsInScope.has(p.id));
    }
    return products.filter((p) => {
      if (p.assignedLocations?.length) {
        return p.assignedLocations.some((a) => {
          const u = assignedLocationEntryUuid(a);
          return u != null && selectedRackBinUUIDs.has(u);
        });
      }
      return false;
    });
  }, [
    selectedRackForMagazyn,
    rackProductMode,
    products,
    filterToSingleBin,
    baseList,
    usingInventory,
    inventoryMaps,
    rackKey,
    selectedRackBinUUIDs,
    selectedRackForMagazyn,
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

    if (usingInventory && inventoryMaps) {
      let totalQuantity = 0;
      for (const p of rackWideBaseList) {
        const invRowsForProduct = inventoryMaps.byProduct.get(p.id) ?? [];
        let rackTotalQty = 0;
        for (const u of selectedRackBinUUIDs) {
          let invQ = 0;
          for (const inv of invRowsForProduct) {
            if (invRowMatchesBin(inv, u)) invQ += safeQuantity(inv.quantity);
          }
          let assignQ = 0;
          if (p.assignedLocations?.length) {
            for (const a of p.assignedLocations) {
              if (assignedLocationEntryUuid(a) === u) assignQ += safeQuantity(a.quantity);
            }
          }
          if (invQ > 0) rackTotalQty += invQ;
          else rackTotalQty += assignQ;
        }
        totalQuantity += rackTotalQty;
      }
      return { uniqueProductsCount, totalQuantity };
    }

    let totalQuantity = 0;
    for (const p of rackWideBaseList) {
      if (p.assignedLocations?.length) {
        for (const a of p.assignedLocations) {
          const u = assignedLocationEntryUuid(a);
          if (u && selectedRackBinUUIDs.has(u)) totalQuantity += safeQuantity(a.quantity);
        }
      }
    }
    return { uniqueProductsCount, totalQuantity };
  }, [
    rackWideBaseList,
    rackProductMode,
    usingInventory,
    inventoryMaps,
    selectedRackBinUUIDs,
    selectedRackForMagazyn,
  ]);

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
    <aside className="flex h-full min-h-0 w-[380px] flex-none flex-col self-stretch overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-r-xl border-l border-slate-700/90 bg-slate-800 designer-rail-scroll">
      <div className="flex shrink-0 flex-col gap-2 border-b border-slate-600/80 px-4 py-3.5">
        {selectedRackForMagazyn && onRequestClearRack && hasAssignedProductsOnRack && (
          <button
            type="button"
            onClick={onRequestClearRack}
            disabled={clearRackBusy}
            className="w-full rounded-md border border-red-500/50 bg-slate-900/30 px-2 py-1 text-[11px] font-medium text-red-200 hover:border-red-400/70 hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Opróżnij regał
          </button>
        )}
        <h2 className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Produkty w regale</h2>
        <input
          type="text"
          value={productSearchQuery}
          onChange={(e) => setProductSearchQuery(e.target.value)}
          placeholder="Szukaj (nazwa, SKU...)"
          className="w-full rounded-md border border-slate-600/80 bg-slate-700/40 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        />
        {selectedRackForMagazyn && (
          <p className="text-[11px] leading-snug text-slate-500">
            {rackSummaryStats.uniqueProductsCount === 0 || rackSummaryStats.totalQuantity === 0
              ? "Brak produktów"
              : `${formatProduktCount(rackSummaryStats.uniqueProductsCount)} • ${rackSummaryStats.totalQuantity} szt.`}
          </p>
        )}
      </div>
      <div className="flex flex-none flex-col gap-2 p-3.5">
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
        <div className="min-h-0 flex-none space-y-2">
          {filterToSingleBin && selectedLocationBadge != null && (
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
              const invRowsForProduct = usingInventory && inventoryMaps ? inventoryMaps.byProduct.get(p.id) ?? [] : [];
              let currentLocation: LocationRow | null = null;
              let otherLocations: LocationRow[] = [];
              let quantityAtLocation = 0;

              if (usingInventory && inventoryMaps) {
                if (filterToSingleBin && selectedBinLabel) {
                  const su = normalizeInventoryLocationUuid(selectedBinUUID);
                  const qtyAtSelected = su
                    ? invRowsForProduct
                        .filter((inv) => invRowMatchesBin(inv, su))
                        .reduce((s, inv) => s + safeQuantity(inv.quantity), 0)
                    : 0;

                  let assignedQtyAtSelected = 0;
                  if (selectedBinUUID && p.assignedLocations?.length) {
                    for (const a of p.assignedLocations) {
                      if (assignedLocationEntryUuid(a) === selectedBinUUID) {
                        assignedQtyAtSelected += safeQuantity(a.quantity);
                      }
                    }
                  }

                  if (qtyAtSelected > 0 && su) {
                    currentLocation = {
                      locationUUID: su,
                      locationLabel: (su && uuidToDisplayLabel[su]) || selectedBinLabel || su,
                      quantity: qtyAtSelected,
                      storageType: uuidToStorageType.get(su),
                    };
                  } else if (assignedQtyAtSelected > 0 && selectedBinUUID) {
                    currentLocation = {
                      locationUUID: selectedBinUUID,
                      locationLabel: (selectedBinUUID && uuidToDisplayLabel[selectedBinUUID]) || selectedBinLabel || selectedBinUUID,
                      quantity: assignedQtyAtSelected,
                      storageType: uuidToStorageType.get(selectedBinUUID),
                    };
                  }

                  const invDisplayByCanonical = new Map<string, string>();
                  const qtyByLoc = new Map<string, number>();
                  for (const inv of invRowsForProduct) {
                    if (invRowIsFocusedBin(inv, selectedBinUUID)) continue;
                    const ck = inventoryRowCanonicalLocKey(inv);
                    if (!ck) continue;
                    const q = safeQuantity(inv.quantity);
                    if (q <= 0) continue;
                    const raw = uuidToDisplayLabel[ck] ?? "";
                    if (!invDisplayByCanonical.has(ck) && raw) {
                      invDisplayByCanonical.set(ck, raw.replace(/\s+/g, " ").trim());
                    }
                    qtyByLoc.set(ck, (qtyByLoc.get(ck) ?? 0) + q);
                  }
                  if (p.assignedLocations?.length) {
                    const assignAdd = new Map<string, number>();
                    for (const a of p.assignedLocations) {
                      const u = assignedLocationEntryUuid(a);
                      if (!u || u === selectedBinUUID) continue;
                      if (!uuidToDisplayLabel[u]) {
                        warn("[MagazynProductsSidebar] assigned_locations UUID not in layout", u);
                        continue;
                      }
                      if (qtyByLoc.has(u)) continue;
                      const qAssign = safeQuantity(a.quantity);
                      if (qAssign <= 0) continue;
                      assignAdd.set(u, (assignAdd.get(u) ?? 0) + qAssign);
                    }
                    for (const [locKey, qv] of assignAdd) {
                      if (qtyByLoc.has(locKey)) continue;
                      qtyByLoc.set(locKey, qv);
                    }
                  }
                  otherLocations = sortOtherLocationsForDisplay(
                    Array.from(qtyByLoc.entries()).map(([ck, qty]) => {
                      const binOnly = invDisplayByCanonical.get(ck) ?? uuidToDisplayLabel[ck] ?? ck;
                      return {
                        locationUUID: ck,
                        locationLabel: uuidToDisplayLabel[ck] ?? binOnly,
                        quantity: qty,
                        storageType: uuidToStorageType.get(ck),
                      };
                    }),
                    layout
                  );
                  quantityAtLocation = qtyAtSelected > 0 ? qtyAtSelected : assignedQtyAtSelected;
                } else {
                  // Rack-wide: total qty on this rack (per bin: inventory wins over assigned). "Inne lokalizacje" = all except optionally the focused bin, including other bins on this rack.
                  const excludeBinUuid =
                    selectedBinUUID != null && selectedLocationForProducts != null ? normalizeInventoryLocationUuid(selectedBinUUID) : null;

                  let rackTotalQty = 0;
                  for (const u of selectedRackBinUUIDs) {
                    let invQ = 0;
                    for (const inv of invRowsForProduct) {
                      if (invRowMatchesBin(inv, u)) invQ += safeQuantity(inv.quantity);
                    }
                    let assignQ = 0;
                    if (p.assignedLocations?.length) {
                      for (const a of p.assignedLocations) {
                        if (assignedLocationEntryUuid(a) === u) assignQ += safeQuantity(a.quantity);
                      }
                    }
                    if (invQ > 0) rackTotalQty += invQ;
                    else rackTotalQty += assignQ;
                  }
                  quantityAtLocation = rackTotalQty;

                  const invDisplayByCanonicalRack = new Map<string, string>();
                  const qtyByLoc = new Map<string, number>();
                  for (const inv of invRowsForProduct) {
                    if (excludeBinUuid && invRowIsFocusedBin(inv, selectedBinUUID)) continue;
                    const ck = inventoryRowCanonicalLocKey(inv);
                    if (!ck) continue;
                    const q = safeQuantity(inv.quantity);
                    if (q <= 0) continue;
                    const raw = uuidToDisplayLabel[ck] || ck;
                    if (!invDisplayByCanonicalRack.has(ck)) {
                      invDisplayByCanonicalRack.set(ck, raw.replace(/\s+/g, " ").trim());
                    }
                    qtyByLoc.set(ck, (qtyByLoc.get(ck) ?? 0) + q);
                  }
                  if (p.assignedLocations?.length) {
                    const assignAdd = new Map<string, number>();
                    for (const a of p.assignedLocations) {
                      const u = assignedLocationEntryUuid(a);
                      if (!u) continue;
                      if (selectedBinUUID && u === selectedBinUUID) continue;
                      if (!uuidToDisplayLabel[u]) {
                        warn("[MagazynProductsSidebar] assigned_locations UUID not in layout", u);
                        continue;
                      }
                      if (excludeBinUuid && u === excludeBinUuid) continue;
                      if (qtyByLoc.has(u)) continue;
                      const qAssign = safeQuantity(a.quantity);
                      if (qAssign <= 0) continue;
                      assignAdd.set(u, (assignAdd.get(u) ?? 0) + qAssign);
                    }
                    for (const [locKey, qv] of assignAdd) {
                      if (qtyByLoc.has(locKey)) continue;
                      qtyByLoc.set(locKey, qv);
                    }
                  }
                  otherLocations = sortOtherLocationsForDisplay(
                    Array.from(qtyByLoc.entries()).map(([ck, qty]) => {
                      const binOnly = invDisplayByCanonicalRack.get(ck) ?? uuidToDisplayLabel[ck] ?? ck;
                      return {
                        locationUUID: ck,
                        locationLabel: uuidToDisplayLabel[ck] ?? binOnly,
                        quantity: qty,
                        storageType: uuidToStorageType.get(ck),
                      };
                    }),
                    layout
                  );
                }
              } else {
                // Legacy assigned_locations-based UI fallback (only used when inventoryMaps is absent).
                const currentLocationLegacy = p.assignedLocations?.find((a) => a.locationUUID === selectedBinUUID) ?? null;
                if (currentLocationLegacy) {
                  const uu = currentLocationLegacy.locationUUID;
                  const binOnly =
                    (uu && uuidToDisplayLabel[uu]) || currentLocationLegacy.locationAddress || uu || "";
                  currentLocation = {
                    locationUUID: currentLocationLegacy.locationUUID,
                    locationLabel: uu ? (uuidToDisplayLabel[uu] ?? binOnly) : binOnly,
                    quantity: safeQuantity(currentLocationLegacy.quantity),
                    storageType: currentLocationLegacy.storageType,
                  };
                }

                const otherLocationsRaw =
                  selectedBinUUID != null
                    ? (p.assignedLocations ?? []).filter((a) => a.locationUUID !== selectedBinUUID)
                    : (p.assignedLocations ?? []).filter((a) => !selectedRackBinUUIDs.has(a.locationUUID));

                otherLocations = sortOtherLocationsForDisplay(
                  otherLocationsRaw.map((loc) => {
                    const u = loc.locationUUID;
                    const binOnly =
                      (u && uuidToDisplayLabel[u]) || loc.locationAddress || u || "";
                    return {
                      locationUUID: loc.locationUUID,
                      locationLabel: u ? (uuidToDisplayLabel[u] ?? binOnly) : binOnly,
                      quantity: safeQuantity(loc.quantity),
                      storageType: loc.storageType,
                    };
                  }),
                  layout
                );

                quantityAtLocation = currentLocationLegacy
                  ? safeQuantity(currentLocationLegacy.quantity)
                  : filterToSingleBin && selectedBinUUID && p.assignedLocations?.length
                    ? safeQuantity(p.assignedLocations.find((a) => a.locationUUID === selectedBinUUID)?.quantity ?? p.quantity)
                    : safeQuantity(p.quantity);
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
                  className={`block cursor-pointer rounded-xl border p-3 shadow-sm transition-all duration-150 hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                    isReserveLocation ? "border-amber-400/70 bg-slate-700/70 ring-1 ring-amber-400/40 hover:bg-slate-600/80" : "border-slate-600/80 bg-slate-700/60 hover:border-slate-500 hover:bg-slate-600/70"
                  } ${
                    selectedProductId === p.id && onToggleProductMapHighlight ? "ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-800" : ""
                  }`}
                >
                  {currentLocation && (
                    <div
                      className="mb-1.5 flex items-center justify-between gap-1.5 rounded border border-blue-500/40 bg-blue-950/30 px-1.5 py-1 text-[10px] font-medium text-blue-200"
                      onMouseEnter={() => onHoverLocationUUIDChange?.(currentLocation.locationUUID)}
                      onMouseLeave={() => onHoverLocationUUIDChange?.(null)}
                    >
                      <span className="min-w-0">
                        Aktualna lokalizacja: {currentLocationLabel} — {safeQuantity(currentLocation.quantity)} szt.
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
                          className="rounded border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-200"
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
                            className="p-0.5 rounded shrink-0 text-blue-200 hover:text-red-400 hover:bg-slate-800/80 disabled:opacity-40"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-500/80 bg-slate-600">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
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
                      <div className="line-clamp-2 break-words text-xs font-semibold leading-snug text-slate-50">
                        {highlightQueryInText(p.name ?? "", productSearchQuery, p.id)}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">SKU {p.sku ?? "—"} · EAN {p.ean ?? "—"}</div>
                      {hasQuantityBreakdown ? (
                        <>
                          <div className="mt-1 text-[11px] text-slate-400">Łącznie <span className="font-mono font-semibold text-slate-200">{enriched.totalQuantity}</span></div>
                          <div className="text-[10px] text-slate-500">Podst. <span className="font-mono text-slate-300">{enriched.primaryQuantity ?? 0}</span> · Rez. <span className="font-mono text-amber-300/90">{enriched.reserveQuantity ?? 0}</span></div>
                        </>
                      ) : (
                        <div className="mt-1 text-[11px] text-slate-400">Szt. <span className="font-mono font-semibold text-slate-200">{quantityAtLocation}</span></div>
                      )}
                      <div className="text-[10px] text-slate-500">Obj. <span className="font-mono text-cyan-300/90">{formatVolume(volumeAtLocation)} dm³</span></div>
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
                          className="mt-1.5 text-[10px] text-cyan-400/90 hover:text-cyan-300"
                        >
                          Inne lokalizacje
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && otherLocations.length > 0 && (
                    <div className="mt-1.5 border-t border-slate-600/60 pt-1.5">
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
