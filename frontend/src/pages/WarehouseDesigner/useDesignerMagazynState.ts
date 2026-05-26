import { useMemo, useCallback } from "react";
import type { LayoutState, WarehouseProduct, BinState } from "../../types/warehouse";
import { safeQuantity, safeVolumeDm3 } from "./DesignerRackPlacement";
import {
  binVolumeDm3,
  calculateMaxCapacityByVolume,
  calculatePackingLayout,
  type PackingLayoutResult,
} from "../../components/warehouse/warehouseUtils";
import { normalizeInventoryLocationUuid, type InventoryMaps, type InventoryRow } from "./inventoryMaps";

/** API / state may expose `location_uuid` (snake) or `locationUUID` (camel). */
function binLocationUuid(bin: BinState): string | undefined {
  const u = (bin as { locationUUID?: string; location_uuid?: string }).locationUUID ?? (bin as { location_uuid?: string }).location_uuid;
  if (typeof u !== "string") return undefined;
  const t = u.trim();
  return t !== "" ? t : undefined;
}

function assignedLocationEntryUuid(a: {
  locationUUID?: string;
  location_uuid?: string;
}): string | undefined {
  if (typeof a.locationUUID === "string" && a.locationUUID.trim() !== "") return a.locationUUID.trim();
  if (typeof a.location_uuid === "string" && a.location_uuid.trim() !== "") return a.location_uuid.trim();
  return undefined;
}

/** Quantity from assigned_locations (UUID-only) for this bin. */
function quantityFromAssignedForBin(
  p: WarehouseProduct,
  uuid: string | undefined
): number {
  if (uuid && p.assignedLocations?.length) {
    const ent = p.assignedLocations.find((x) => assignedLocationEntryUuid(x) === uuid);
    if (ent) return safeQuantity(ent.quantity);
  }
  return 0;
}

/** Per-product aggregated Stock qty at a bin (only rows with qty > 0). */
function stockQtyByProductIdAtBin(invRows: InventoryRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const inv of invRows) {
    const q = safeQuantity(inv.quantity);
    if (q <= 0) continue;
    const pid = String(inv.product_id);
    m.set(pid, (m.get(pid) ?? 0) + q);
  }
  return m;
}

export interface UseDesignerMagazynStateParams {
  layout: LayoutState;
  products: WarehouseProduct[];
  selectedRackIdForSideView: number | string | null;
  inventoryRows?: InventoryRow[];
  inventoryMaps?: InventoryMaps | null;
}

/** Effective height (cm) for stacking: compressed when stack_compressible and compressed_height_cm > 0. */
function effectiveHeightCm(product: WarehouseProduct): number | undefined {
  const raw = product.height_cm;
  if (product.stack_compressible && product.compressed_height_cm != null && product.compressed_height_cm > 0)
    return product.compressed_height_cm;
  return raw ?? undefined;
}

/** Max stack count by weight: floor(max_stack_weight / unit_weight). Infinity if no limit. */
function maxCountZByWeight(product: WarehouseProduct): number {
  const maxW = product.max_stack_weight;
  const weight = product.weight_kg ?? product.weight;
  if (maxW == null || maxW <= 0 || weight == null || weight <= 0) return Infinity;
  const n = Math.floor(maxW / weight);
  return Number.isFinite(n) && n >= 0 ? n : Infinity;
}

/** Capacity (pieces) for a product in a slot: orientation, shape, compression, weight limit. */
function capacityForProduct(
  slotDims: { width_cm?: number; depth_cm?: number; height_cm?: number },
  product: WarehouseProduct
): number {
  const shape = product.shape_type ?? "box";
  // Cylinders are always treated as upright (no horizontal rotation).
  const orient = shape === "cylinder" ? "upright" : (product.orientation_type ?? "any");
  const effectiveH = effectiveHeightCm(product);
  // For cylinder: height = longest dimension (vertical axis); diameter = cross-section (smallest dimension).
  // Example: width=5, height=5, length=22 → height=22, diameter=5 → countZ=floor(70/22)=3, capacity 10×12×3=360.
  const w = product.width_cm ?? 0;
  const d = product.depth_cm ?? 0;
  const h = product.height_cm ?? 0;
  const cylinderHeight = shape === "cylinder"
    ? Math.max(w, d, effectiveH ?? h)
    : effectiveH ?? product.height_cm;
  const cylinderDiameter = shape === "cylinder"
    ? (() => { const m = Math.min(w || Infinity, d || Infinity, h || Infinity); return Number.isFinite(m) ? m : 0; })()
    : 0;
  const dims =
    shape === "cylinder"
      ? {
          width_cm: cylinderDiameter,
          depth_cm: cylinderDiameter,
          height_cm: cylinderHeight,
        }
      : {
          width_cm: product.width_cm,
          depth_cm: product.depth_cm,
          height_cm: effectiveH ?? product.height_cm,
        };
  // Shape-specific guards: cylinder needs diameter and height derived from dimensions; box needs all three.
  if (shape === "cylinder") {
    if (!cylinderDiameter || !cylinderHeight) return 0;
  } else {
    if (!dims.width_cm || !dims.depth_cm || !dims.height_cm) return 0;
  }

  const noStack = product.stack_behavior === "no_stack" || orient === "no_stack";
  const orientationLimit = noStack ? 1 : Infinity;
  const weightLimit = maxCountZByWeight(product);
  const slotH = slotDims.height_cm ?? 0;
  const heightLimit =
    slotH > 0 && dims.height_cm > 0 ? Math.floor(slotH / dims.height_cm) : Infinity;
  const maxCountZ = Math.min(heightLimit, weightLimit, orientationLimit);
  const maxCountZArg = Number.isFinite(maxCountZ) ? maxCountZ : undefined;

  if (shape === "cylinder") {
    const diameter = dims.width_cm;
    const height = dims.height_cm;
    const countX = Math.floor((slotDims.width_cm ?? 0) / diameter);
    const countY = Math.floor((slotDims.depth_cm ?? 0) / diameter);
    const countZ = Math.min(Math.floor(slotH / height), maxCountZ);
    return countX * countY * countZ;
  }
  const allowedRotations = orient === "upright" ? [0, 2, 4] : [0, 1, 2, 3, 4, 5];
  const layout = calculatePackingLayout(slotDims, dims, allowedRotations, maxCountZArg);
  return layout?.count ?? 0;
}

/** Packing layout for preview: orientation, shape, compression, weight limit. */
function packingLayoutForProduct(
  slotDims: { width_cm?: number; depth_cm?: number; height_cm?: number },
  product: WarehouseProduct
): (PackingLayoutResult & { shapeType: "box" | "cylinder" }) | null {
  const shape = product.shape_type ?? "box";
  const orient = shape === "cylinder" ? "upright" : (product.orientation_type ?? "any");
  const effectiveH = effectiveHeightCm(product);
  const w = product.width_cm ?? 0;
  const d = product.depth_cm ?? 0;
  const h = product.height_cm ?? 0;
  const cylinderHeight = shape === "cylinder"
    ? Math.max(w, d, effectiveH ?? h)
    : effectiveH ?? product.height_cm;
  const cylinderDiameter = shape === "cylinder"
    ? (() => { const m = Math.min(w || Infinity, d || Infinity, h || Infinity); return Number.isFinite(m) ? m : 0; })()
    : 0;
  const dims =
    shape === "cylinder"
      ? {
          width_cm: cylinderDiameter,
          depth_cm: cylinderDiameter,
          height_cm: cylinderHeight,
        }
      : {
          width_cm: product.width_cm,
          depth_cm: product.depth_cm,
          height_cm: effectiveH ?? product.height_cm,
        };
  if (shape === "cylinder") {
    if (!cylinderDiameter || !cylinderHeight) return null;
  } else {
    if (!dims.width_cm || !dims.depth_cm || !dims.height_cm) return null;
  }

  const noStack = product.stack_behavior === "no_stack" || orient === "no_stack";
  const orientationLimit = noStack ? 1 : Infinity;
  const weightLimit = maxCountZByWeight(product);
  const slotH = slotDims.height_cm ?? 0;
  const heightLimit =
    slotH > 0 && dims.height_cm > 0 ? Math.floor(slotH / dims.height_cm) : Infinity;
  const maxCountZ = Math.min(heightLimit, weightLimit, orientationLimit);
  const maxCountZArg = Number.isFinite(maxCountZ) ? maxCountZ : undefined;

  if (shape === "cylinder") {
    const diameter = dims.width_cm;
    const height = dims.height_cm;
    const sw = slotDims.width_cm ?? 0;
    const sd = slotDims.depth_cm ?? 0;
    const sh = slotDims.height_cm ?? 0;
    const countX = Math.floor(sw / diameter);
    const countY = Math.floor(sd / diameter);
    const countZ = Math.min(Math.floor(sh / height), maxCountZ);
    const count = countX * countY * countZ;
    if (count <= 0) return null;
    return {
      count,
      rotationIndex: 0,
      countX,
      countY,
      countZ,
      boxW_cm: diameter,
      boxD_cm: diameter,
      boxH_cm: height,
      shapeType: "cylinder",
    };
  }
  const allowedRotations = orient === "upright" ? [0, 2, 4] : [0, 1, 2, 3, 4, 5];
  const layout = calculatePackingLayout(slotDims, dims, allowedRotations, maxCountZArg);
  if (!layout) return null;
  return { ...layout, shapeType: "box" };
}

export function useDesignerMagazynState(params: UseDesignerMagazynStateParams) {
  const { layout, products, selectedRackIdForSideView, inventoryRows, inventoryMaps } = params;
  const hasInventory = (inventoryRows?.length ?? 0) > 0 && inventoryMaps != null;

  const productsById = useMemo(() => {
    const map = new Map<string, WarehouseProduct>();
    for (const p of products) map.set(String(p.id), p);
    return map;
  }, [products]);

  /** Stock rows for a bin (join inventory.location_uuid ↔ bin.locationUUID). */
  const getInventoryRowsForBin = useCallback(
    (locationUuid?: string | null) => {
      if (!hasInventory) return [];
      const u = normalizeInventoryLocationUuid(locationUuid);
      if (!u) return [];
      return inventoryMaps!.byLocationUuid.get(u) ?? [];
    },
    [hasInventory, inventoryMaps]
  );

  /** Selected rack for Magazyn view (for product/location and display rack). */
  const selectedRackForMagazyn = useMemo(
    () => (selectedRackIdForSideView != null ? layout.racks.find((r) => String(r.id ?? r.rack_index) === String(selectedRackIdForSideView)) ?? null : null),
    [layout.racks, selectedRackIdForSideView]
  );
  /** Set of locationUUIDs for bins in the selected rack (for filtering by assignedLocations). */
  const selectedRackBinUUIDs = useMemo(() => {
    if (!selectedRackForMagazyn) return new Set<string>();
    return new Set(
      selectedRackForMagazyn.bins
        .map((b) => binLocationUuid(b))
        .filter((u): u is string => Boolean(u))
    );
  }, [selectedRackForMagazyn]);
  /** Helper: used volume (dm³) at a bin — Stock + assigned_locations; skip assigned when same product already has Stock at this bin. */
  const usedVolumeAtBin = useCallback(
    (bin: BinState) => {
      let used = 0;
      const uuid = binLocationUuid(bin);
      const stockByPid = stockQtyByProductIdAtBin(getInventoryRowsForBin(uuid));
      for (const [pid, q] of stockByPid) {
        const p = productsById.get(pid);
        if (!p) continue;
        used += q * safeVolumeDm3(p.volume_dm3);
      }
      for (const p of products) {
        const aQty = quantityFromAssignedForBin(p, uuid);
        if (aQty <= 0) continue;
        if (stockByPid.has(p.id)) continue;
        used += aQty * safeVolumeDm3(p.volume_dm3);
      }
      return used;
    },
    [products, productsById, getInventoryRowsForBin]
  );
  /** Rack with bins' used_volume_dm3 derived from products (for occupancy bar). */
  const displayRack = useMemo(() => {
    if (!selectedRackForMagazyn) return null;
    const bins = selectedRackForMagazyn.bins.map((b) => {
      const used = usedVolumeAtBin(b);
      return { ...b, used_volume_dm3: used, current_load_dm3: used };
    });
    return { ...selectedRackForMagazyn, bins };
  }, [selectedRackForMagazyn, products, usedVolumeAtBin]);
  /** Per-bin total quantity (szt.) — Stock + assigned_locations; skip assigned when product already in Stock at this bin. */
  const binItemCounts = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const out: Record<string, number> = {};
    for (const b of selectedRackForMagazyn.bins) {
      const uuid = binLocationUuid(b);
      const stockByPid = stockQtyByProductIdAtBin(getInventoryRowsForBin(uuid));
      let qty = 0;
      for (const q of stockByPid.values()) qty += q;
      for (const p of products) {
        const aQty = quantityFromAssignedForBin(p, uuid);
        if (aQty <= 0) continue;
        if (stockByPid.has(p.id)) continue;
        qty += aQty;
      }
      out[`${b.level_index}-${b.segment_index}`] = qty;
    }
    return out;
  }, [selectedRackForMagazyn, products, getInventoryRowsForBin]);
  /** Per-bin count of different products — union of Stock and assigned_locations (assigned skipped if product has Stock at bin). */
  const binUniqueProductCounts = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const out: Record<string, number> = {};
    for (const b of selectedRackForMagazyn.bins) {
      const uuid = binLocationUuid(b);
      const stockByPid = stockQtyByProductIdAtBin(getInventoryRowsForBin(uuid));
      const seen = new Set<string>();
      for (const pid of stockByPid.keys()) seen.add(pid);
      for (const p of products) {
        const aQty = quantityFromAssignedForBin(p, uuid);
        if (aQty <= 0) continue;
        if (stockByPid.has(p.id)) continue;
        seen.add(p.id);
      }
      out[`${b.level_index}-${b.segment_index}`] = seen.size;
    }
    return out;
  }, [selectedRackForMagazyn, products, getInventoryRowsForBin]);

  /** Per-bin load in kg: Stock + assigned_locations; skip assigned when product has Stock at bin. */
  const binLoadKg = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const out: Record<string, number> = {};
    for (const b of selectedRackForMagazyn.bins) {
      let load = 0;
      const uuid = binLocationUuid(b);
      const stockByPid = stockQtyByProductIdAtBin(getInventoryRowsForBin(uuid));
      for (const [pid, q] of stockByPid) {
        const p = productsById.get(pid);
        if (!p) continue;
        const weight = (p as { weight_kg?: number; weight?: number }).weight_kg ?? (p as { weight?: number }).weight ?? 0;
        const productWeight = Number(weight);
        if (!Number.isFinite(productWeight) || productWeight < 0) continue;
        load += productWeight * q;
      }
      for (const p of products) {
        const aQty = quantityFromAssignedForBin(p, uuid);
        if (aQty <= 0) continue;
        if (stockByPid.has(p.id)) continue;
        const weight = (p as { weight_kg?: number; weight?: number }).weight_kg ?? (p as { weight?: number }).weight ?? 0;
        const productWeight = Number(weight);
        if (!Number.isFinite(productWeight) || productWeight < 0) continue;
        load += productWeight * aQty;
      }
      const safeLoad = Number.isFinite(load) ? load : 0;
      out[`${b.level_index}-${b.segment_index}`] = safeLoad;
    }
    return out;
  }, [selectedRackForMagazyn, products, productsById, getInventoryRowsForBin]);

  /** Per-level total load in kg: sum of bin loads for that level. */
  const levelLoadKg = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const out: Record<number, number> = {};
    for (const b of selectedRackForMagazyn.bins) {
      const key = `${b.level_index}-${b.segment_index}`;
      const load = binLoadKg[key] ?? 0;
      const levelTotal = (out[b.level_index] ?? 0) + load;
      out[b.level_index] = Number.isFinite(levelTotal) ? levelTotal : 0;
    }
    return out;
  }, [selectedRackForMagazyn, binLoadKg]);

  /** Per-bin max physical capacity (pieces) for the first assigned product (dimensions or volume fallback). Only set when bin has at least one product. */
  const binMaxCapacityPieces = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const rack = selectedRackForMagazyn;
    const out: Record<string, number> = {};
    for (const bin of rack.bins) {
      const key = `${bin.level_index}-${bin.segment_index}`;
      const quantity = binItemCounts[key] ?? 0;
      if (quantity <= 0) continue;

      const uuid = binLocationUuid(bin);
      const stockByPid = stockQtyByProductIdAtBin(getInventoryRowsForBin(uuid));
      let firstProduct: WarehouseProduct | null = null;
      for (const inv of getInventoryRowsForBin(uuid)) {
        if (safeQuantity(inv.quantity) <= 0) continue;
        firstProduct = productsById.get(String(inv.product_id)) ?? null;
        if (firstProduct) break;
      }
      if (!firstProduct) {
        for (const p of products) {
          const aQty = quantityFromAssignedForBin(p, uuid);
          if (aQty <= 0) continue;
          if (stockByPid.has(p.id)) continue;
          firstProduct = p;
          break;
        }
      }

      if (!firstProduct) continue;

      const slotVol = binVolumeDm3(bin, rack);
      const productVol = safeVolumeDm3(firstProduct.volume_dm3);
      // Derive slot dimensions from rack when layout API does not return bin width_cm/depth_cm/height_cm
      const rackW = (rack as { width_cm?: number }).width_cm;
      const rackD = (rack as { depth_cm?: number }).depth_cm ?? (rack as { length_cm?: number }).length_cm;
      const rackH = (rack as { height_cm?: number }).height_cm;
      const levels = Math.max(1, (rack as { levels?: number }).levels ?? 1);
      const binsPerLevel = Math.max(1, (rack as { bins_per_level?: number }).bins_per_level ?? 1);
      const slotWidth =
        bin.width_cm ??
        (rackW != null && rackW > 0 && binsPerLevel > 0 ? rackW / binsPerLevel : undefined);
      const slotDepth = bin.depth_cm ?? (rackD != null && rackD > 0 ? rackD : undefined);
      const slotHeight =
        bin.height_cm ??
        (rackH != null && rackH > 0 && levels > 0 ? rackH / levels : undefined);
      const slotDims = {
        width_cm: slotWidth,
        depth_cm: slotDepth,
        height_cm: slotHeight,
      };
      const byDims = capacityForProduct(slotDims, firstProduct);
      const capacity = byDims > 0 ? byDims : calculateMaxCapacityByVolume(slotVol, productVol);
      if (Number.isFinite(capacity) && capacity >= 0) out[key] = capacity;
    }
    return out;
  }, [selectedRackForMagazyn, products, binItemCounts, productsById, getInventoryRowsForBin]);

  /** Per-bin list of products with quantity and capacity (for tooltip: capacity per product). */
  const binCapacityDetails = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const rack = selectedRackForMagazyn;
    const out: Record<
      string,
      { product: WarehouseProduct; quantity: number; capacity: number }[]
    > = {};
    for (const bin of rack.bins) {
      const key = `${bin.level_index}-${bin.segment_index}`;
      const uuid = binLocationUuid(bin);
      const stockByPid = stockQtyByProductIdAtBin(getInventoryRowsForBin(uuid));
      const qtyByProduct = new Map<string, { product: WarehouseProduct; quantity: number }>();
      for (const inv of getInventoryRowsForBin(uuid)) {
        const qty = safeQuantity(inv.quantity);
        if (qty <= 0) continue;
        const pid = String(inv.product_id);
        const p = productsById.get(pid);
        if (!p) continue;
        const existing = qtyByProduct.get(pid);
        if (existing) existing.quantity += qty;
        else qtyByProduct.set(pid, { product: p, quantity: qty });
      }
      for (const p of products) {
        const aQty = quantityFromAssignedForBin(p, uuid);
        if (aQty <= 0) continue;
        if (stockByPid.has(p.id)) continue;
        qtyByProduct.set(p.id, { product: p, quantity: aQty });
      }
      const assigned = Array.from(qtyByProduct.values());
      if (assigned.length === 0) continue;

      const slotVol = binVolumeDm3(bin, rack);
      const rackW = (rack as { width_cm?: number }).width_cm;
      const rackD = (rack as { depth_cm?: number }).depth_cm ?? (rack as { length_cm?: number }).length_cm;
      const rackH = (rack as { height_cm?: number }).height_cm;
      const levels = Math.max(1, (rack as { levels?: number }).levels ?? 1);
      const binsPerLevel = Math.max(1, (rack as { bins_per_level?: number }).bins_per_level ?? 1);
      const slotWidth =
        bin.width_cm ??
        (rackW != null && rackW > 0 && binsPerLevel > 0 ? rackW / binsPerLevel : undefined);
      const slotDepth = bin.depth_cm ?? (rackD != null && rackD > 0 ? rackD : undefined);
      const slotHeight =
        bin.height_cm ??
        (rackH != null && rackH > 0 && levels > 0 ? rackH / levels : undefined);
      const slotDims = {
        width_cm: slotWidth,
        depth_cm: slotDepth,
        height_cm: slotHeight,
      };

      const details: { product: WarehouseProduct; quantity: number; capacity: number }[] = [];
      for (const { product: prod, quantity } of assigned) {
        const productVol = safeVolumeDm3(prod.volume_dm3);
        const byDims = capacityForProduct(slotDims, prod);
        const capacity =
          byDims > 0 ? byDims : calculateMaxCapacityByVolume(slotVol, productVol);
        if (Number.isFinite(capacity) && capacity >= 0) {
          details.push({ product: prod, quantity, capacity });
        }
      }
      if (details.length > 0) out[key] = details;
    }
    return out;
  }, [selectedRackForMagazyn, products, productsById, getInventoryRowsForBin]);

  /** Packing layout preview for bins with exactly one product (dimensions required). Used for hover overlay. */
  const binPackingPreview = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const rack = selectedRackForMagazyn;
    const out: Record<
      string,
      {
        count: number;
        rotationIndex: number;
        countX: number;
        countY: number;
        countZ: number;
        boxW_cm: number;
        boxD_cm: number;
        boxH_cm: number;
        shapeType: "box" | "cylinder";
        productName: string;
        productDisplayName: string;
        productSku?: string;
        quantity: number;
        slotDims: { width_cm?: number; depth_cm?: number; height_cm?: number };
      }
    > = {};
    for (const bin of rack.bins) {
      const key = `${bin.level_index}-${bin.segment_index}`;
      const uuid = binLocationUuid(bin);
      const stockByPid = stockQtyByProductIdAtBin(getInventoryRowsForBin(uuid));
      const qtyByProduct = new Map<string, { product: WarehouseProduct; quantity: number }>();
      for (const inv of getInventoryRowsForBin(uuid)) {
        const qty = safeQuantity(inv.quantity);
        if (qty <= 0) continue;
        const pid = String(inv.product_id);
        const p = productsById.get(pid);
        if (!p) continue;
        const existing = qtyByProduct.get(pid);
        if (existing) existing.quantity += qty;
        else qtyByProduct.set(pid, { product: p, quantity: qty });
      }
      for (const p of products) {
        const aQty = quantityFromAssignedForBin(p, uuid);
        if (aQty <= 0) continue;
        if (stockByPid.has(p.id)) continue;
        qtyByProduct.set(p.id, { product: p, quantity: aQty });
      }
      const assigned = Array.from(qtyByProduct.values());
      if (assigned.length !== 1) continue;

      const product = assigned[0].product;
      const rackW = (rack as { width_cm?: number }).width_cm;
      const rackD = (rack as { depth_cm?: number }).depth_cm ?? (rack as { length_cm?: number }).length_cm;
      const rackH = (rack as { height_cm?: number }).height_cm;
      const levels = Math.max(1, (rack as { levels?: number }).levels ?? 1);
      const binsPerLevel = Math.max(1, (rack as { bins_per_level?: number }).bins_per_level ?? 1);
      const slotWidth =
        bin.width_cm ??
        (rackW != null && rackW > 0 && binsPerLevel > 0 ? rackW / binsPerLevel : undefined);
      const slotDepth = bin.depth_cm ?? (rackD != null && rackD > 0 ? rackD : undefined);
      const slotHeight =
        bin.height_cm ??
        (rackH != null && rackH > 0 && levels > 0 ? rackH / levels : undefined);
      const slotDims = {
        width_cm: slotWidth,
        depth_cm: slotDepth,
        height_cm: slotHeight,
      };
      const layout = packingLayoutForProduct(slotDims, product);
      if (layout) {
        const quantity = assigned[0].quantity;
        out[key] = {
          ...layout,
          productName: product.name,
          productDisplayName: product.name.length <= 16 ? product.name : `SKU ${product.sku}`,
          productSku: product.sku,
          quantity,
          slotDims,
        };
      }
    }
    return out;
  }, [selectedRackForMagazyn, products, productsById, getInventoryRowsForBin]);

  return {
    selectedRackForMagazyn,
    selectedRackBinUUIDs,
    displayRack,
    binItemCounts,
    binUniqueProductCounts,
    binLoadKg,
    levelLoadKg,
    binMaxCapacityPieces,
    binCapacityDetails,
    binPackingPreview,
    usedVolumeAtBin,
  };
}
