import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LayoutState, RackState, StorageType, WarehouseProduct } from "../../../types/warehouse";
import { ConfirmModal } from "../../ui/ConfirmModal";
import { getBinDisplayLabel, getRackDisplayId } from "../warehouseUtils";
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

/** Legacy product.location_id (no assigned_locations): same bin label as a rack slot. */
function legacyProductLocationMatchesRack(p: WarehouseProduct, rack: RackState): boolean {
  if (p.location_id == null || (p.assignedLocations?.length ?? 0) > 0) return false;
  const want = normDisplayLabel(String(p.location_id));
  for (const b of rack.bins ?? []) {
    const bl = normDisplayLabel((b.label ?? b.location_id ?? "").trim());
    if (bl && bl === want) return true;
  }
  return false;
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

/**
 * Parse display labels like "A1-A-1" → rack (letter + number), section, position.
 * Returns null if the string does not match the expected pattern.
 */
function parseWarehouseDisplayLabel(label: string): {
  rackLetter: string;
  rackNum: number;
  section: string;
  position: number;
} | null {
  const trimmed = label.trim();
  const parts = trimmed.split("-").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length !== 3) return null;
  const rackPart = parts[0];
  const sectionRaw = parts[1];
  const posPart = parts[2];
  const rackMatch = rackPart.match(/^([A-Za-z]+)(\d+)$/);
  if (!rackMatch) return null;
  const rackLetter = rackMatch[1].toUpperCase();
  const rackNum = parseInt(rackMatch[2], 10);
  if (!Number.isFinite(rackNum)) return null;
  const position = parseInt(posPart, 10);
  if (!Number.isFinite(position)) return null;
  const section = sectionRaw.trim();
  if (!section) return null;
  return { rackLetter, rackNum, section: section.toUpperCase(), position };
}

type LocationRowSortable = {
  locationLabel: string;
  storageType?: StorageType;
  quantity: number;
};

/** Sort "other locations" by rack → section → position; unparseable labels keep stable tie-break (reserve, qty, input order). */
function sortOtherLocationsForDisplay<T extends LocationRowSortable>(rows: T[]): T[] {
  const indexed = rows.map((loc, i) => ({ loc, i }));
  indexed.sort((a, b) => {
    const ka = parseWarehouseDisplayLabel(a.loc.locationLabel);
    const kb = parseWarehouseDisplayLabel(b.loc.locationLabel);
    if (ka && kb) {
      if (ka.rackLetter !== kb.rackLetter) return ka.rackLetter.localeCompare(kb.rackLetter);
      if (ka.rackNum !== kb.rackNum) return ka.rackNum - kb.rackNum;
      if (ka.section !== kb.section) return ka.section.localeCompare(kb.section);
      if (ka.position !== kb.position) return ka.position - kb.position;
    }
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
    storageType?: StorageType;
  };

  function getLocationTypeBadge(storageType?: StorageType): { icon: string; label: string; className: string } | null {
    const normalized = normalizeStorageType(storageType);
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
    return (
      <div
        key={loc.locationUUID}
        onMouseEnter={() => onHoverLocationUUIDChange?.(loc.locationUUID)}
        onMouseLeave={() => onHoverLocationUUIDChange?.(null)}
        className={`flex items-center justify-between gap-1 text-xs ${typeBadge != null ? "text-amber-300" : "text-slate-300"}`}
      >
        <span className="flex items-center gap-1 truncate min-w-0 mr-2">
          {typeBadge?.icon}
          {loc.locationLabel}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <span className="font-mono">{loc.quantity} szt.</span>
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
              className="p-0.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </span>
      </div>
    );
  }

  /** UUID → bin label from layout (display fragment). */
  const uuidToDisplayLabel: Record<string, string> = {};
  /** UUID → rack display id from layout (e.g. A1); omitted when UUID not on layout. */
  const uuidToRackLabel: Record<string, string> = {};
  for (const rack of layout.racks) {
    const rackLabel = getRackDisplayId(rack, layout).trim();
    for (const bin of rack.bins ?? []) {
      const u = (bin.locationUUID ?? "").trim();
      const raw = getBinDisplayLabel(rack, bin, layout).trim() || (bin.label ?? bin.location_id ?? "").trim();
      if (u) {
        uuidToDisplayLabel[u] = raw ? raw.replace(/\s+/g, " ").trim() : u;
        if (rackLabel) uuidToRackLabel[u] = rackLabel;
      } else if (import.meta.env.DEV && raw) {
        console.warn("[MagazynProductsSidebar] layout bin has label but no locationUUID", raw);
      }
    }
  }

  /** UI: `rackLabel-binLabel`; if rack unknown on layout, show bin label only. */
  function fullLocationDisplayLabel(locationUuid: string, binLabelOnly: string): string {
    const rl = uuidToRackLabel[locationUuid]?.trim();
    const bl = (binLabelOnly ?? "").trim() || locationUuid;
    if (!rl) return bl;
    return `${rl}-${bl}`;
  }

  const selectedBin = selectedLocationForProducts != null && selectedRackForMagazyn
    ? selectedRackForMagazyn.bins.find((b) => b.level_index === selectedLocationForProducts.level_index && b.segment_index === selectedLocationForProducts.segment_index)
    : null;
  const selectedBinLabel = selectedBin ? (selectedBin.label ?? selectedBin.location_id ?? "").trim() || null : null;
  const selectedBinUUID = selectedBin?.locationUUID ?? null;
  const filterToSingleBin = selectedBinLabel != null && !showAllProductsInSidebar;
  const usingInventory = inventoryMaps != null;
  const rackKey = selectedRackForMagazyn ? String(selectedRackForMagazyn.id ?? selectedRackForMagazyn.rack_index) : null;

  const uuidToStorageType = useMemo(() => {
    const map = new Map<string, StorageType>();
    for (const rack of layout.racks) {
      for (const bin of rack.bins ?? []) {
        const u = (bin.locationUUID ?? "").trim();
        if (!u || !bin.storage_type) continue;
        map.set(u, bin.storage_type);
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
            for (const p of products) {
              if (filterToSingleBin) {
                if (p.assignedLocations?.length && selectedBinUUID) {
                  if (p.assignedLocations.some((a) => assignedLocationEntryUuid(a) === selectedBinUUID)) {
                    productIdsInScope.add(p.id);
                  }
                } else if (p.location_id === selectedBinLabel) {
                  productIdsInScope.add(p.id);
                }
              } else if (p.assignedLocations?.length) {
                if (
                  p.assignedLocations.some((a) => {
                    const u = assignedLocationEntryUuid(a);
                    return u != null && selectedRackBinUUIDs.has(u);
                  })
                ) {
                  productIdsInScope.add(p.id);
                }
              } else if (selectedRackForMagazyn && legacyProductLocationMatchesRack(p, selectedRackForMagazyn)) {
                productIdsInScope.add(p.id);
              }
            }
            return products.filter((p) => productIdsInScope.has(p.id));
          })()
        : products.filter((p) => {
            if (filterToSingleBin) {
              if (p.assignedLocations?.length && selectedBinUUID) {
                return p.assignedLocations.some((a) => assignedLocationEntryUuid(a) === selectedBinUUID);
              }
              return p.location_id === selectedBinLabel;
            }
            if (p.assignedLocations?.length) {
              return p.assignedLocations.some((a) => {
                const u = assignedLocationEntryUuid(a);
                return u != null && selectedRackBinUUIDs.has(u);
              });
            }
            return selectedRackForMagazyn != null && legacyProductLocationMatchesRack(p, selectedRackForMagazyn);
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
      for (const p of products) {
        if (p.assignedLocations?.length) {
          if (
            p.assignedLocations.some((a) => {
              const u = assignedLocationEntryUuid(a);
              return u != null && selectedRackBinUUIDs.has(u);
            })
          ) {
            productIdsInScope.add(p.id);
          }
        } else if (legacyProductLocationMatchesRack(p, selectedRackForMagazyn)) {
          productIdsInScope.add(p.id);
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
      return legacyProductLocationMatchesRack(p, selectedRackForMagazyn);
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
      } else if (selectedRackForMagazyn && legacyProductLocationMatchesRack(p, selectedRackForMagazyn)) {
        totalQuantity += safeQuantity(p.quantity);
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
  const selectedLocationBadge = getLocationTypeBadge(selectedBin?.storage_type);

  return (
    <aside className="flex h-full min-h-0 w-[320px] flex-none flex-col self-stretch overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-r-xl border-l border-slate-700 bg-slate-800">
      <div className="shrink-0 border-b border-slate-600 flex flex-col gap-2 px-4 py-3">
        {selectedRackForMagazyn && onRequestClearRack && hasAssignedProductsOnRack && (
          <button
            type="button"
            onClick={onRequestClearRack}
            disabled={clearRackBusy}
            className="w-full px-2 py-1.5 rounded-lg text-xs font-medium border border-red-500/60 text-red-300 bg-slate-900/40 hover:bg-red-950/40 hover:border-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Opróżnij regał
          </button>
        )}
        <h2 className="text-xs font-black uppercase text-slate-300">PRODUKTY W REGALE</h2>
        <input
          type="text"
          value={productSearchQuery}
          onChange={(e) => setProductSearchQuery(e.target.value)}
          placeholder="Szukaj (nazwa, SKU...)"
          className="w-full rounded-lg border border-slate-600 bg-slate-700/50 text-slate-100 placeholder-slate-500 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
        />
        {selectedRackForMagazyn && (
          <p className="text-xs text-slate-400 leading-snug">
            {rackSummaryStats.uniqueProductsCount === 0 || rackSummaryStats.totalQuantity === 0
              ? "Brak produktów"
              : `${formatProduktCount(rackSummaryStats.uniqueProductsCount)} • ${rackSummaryStats.totalQuantity} szt.`}
          </p>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-none">
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
          {filterToSingleBin && selectedLocationBadge != null && (
            <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${selectedLocationBadge.className}`}>
              <span aria-label={selectedLocationBadge.label}>{selectedLocationBadge.icon}</span>
              <span>{selectedLocationBadge.label}</span>
            </div>
          )}
          {list.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-6 space-y-1 px-1" role="status">
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
                      locationLabel: fullLocationDisplayLabel(su, selectedBinLabel),
                      quantity: qtyAtSelected,
                      storageType: uuidToStorageType.get(su),
                    };
                  } else if (assignedQtyAtSelected > 0 && selectedBinUUID) {
                    currentLocation = {
                      locationUUID: selectedBinUUID,
                      locationLabel: fullLocationDisplayLabel(selectedBinUUID, selectedBinLabel),
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
                    const raw = (inv.location_name ?? "").trim() || String(inv.location_id);
                    if (!invDisplayByCanonical.has(ck)) {
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
                        if (import.meta.env.DEV) {
                          console.warn("[MagazynProductsSidebar] assigned_locations UUID not in layout", u);
                        }
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
                        locationLabel: fullLocationDisplayLabel(ck, binOnly),
                        quantity: qty,
                        storageType: uuidToStorageType.get(ck),
                      };
                    })
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
                    const raw = (inv.location_name ?? "").trim() || String(inv.location_id);
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
                        if (import.meta.env.DEV) {
                          console.warn("[MagazynProductsSidebar] assigned_locations UUID not in layout", u);
                        }
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
                        locationLabel: fullLocationDisplayLabel(ck, binOnly),
                        quantity: qty,
                        storageType: uuidToStorageType.get(ck),
                      };
                    })
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
                    locationLabel: uu ? fullLocationDisplayLabel(uu, binOnly) : binOnly,
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
                      locationLabel: u ? fullLocationDisplayLabel(u, binOnly) : binOnly,
                      quantity: safeQuantity(loc.quantity),
                      storageType: loc.storageType,
                    };
                  })
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
                  to={`/products/${p.id}`}
                  onClick={(e) => {
                    if (!onToggleProductMapHighlight) return;
                    if (e.ctrlKey || e.metaKey) return;
                    e.preventDefault();
                    onToggleProductMapHighlight(p.id);
                  }}
                  onMouseEnter={() => onHoverProductIdChange?.(p.id)}
                  onMouseLeave={() => onHoverProductIdChange?.(null)}
                  className={`block cursor-pointer rounded-xl border p-3 shadow flex flex-col gap-0 transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                    isReserveLocation ? "border-amber-400 bg-slate-700/80 ring-1 ring-amber-400/50 hover:bg-slate-600/90" : "border-slate-600 bg-slate-700/80 hover:bg-slate-600/100"
                  } ${
                    selectedProductId === p.id && onToggleProductMapHighlight ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-800" : ""
                  }`}
                >
                  {currentLocation && (
                    <div
                      className="mb-2 px-2 py-1 rounded border border-blue-400 bg-blue-900/20 text-blue-300 text-xs font-semibold flex items-center justify-between gap-2"
                      onMouseEnter={() => onHoverLocationUUIDChange?.(currentLocation.locationUUID)}
                      onMouseLeave={() => onHoverLocationUUIDChange?.(null)}
                    >
                      <span className="min-w-0">
                        Aktualna lokalizacja: {currentLocationLabel} — {safeQuantity(currentLocation.quantity)} szt.
                      </span>
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
                      <div className="text-sm font-semibold text-slate-100 break-words line-clamp-2">
                        {highlightQueryInText(p.name ?? "", productSearchQuery, p.id)}
                      </div>
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
                          {filteredLocations.map((loc) => renderLocationRow(p, loc))}
                        </div>
                      ) : (
                        <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
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
