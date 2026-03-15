import { useMemo, useCallback } from "react";
import type { LayoutState, WarehouseProduct, BinState } from "../../types/warehouse";
import { safeQuantity, safeVolumeDm3 } from "./DesignerRackPlacement";

export interface UseDesignerMagazynStateParams {
  layout: LayoutState;
  products: WarehouseProduct[];
  selectedRackIdForSideView: number | string | null;
}

export function useDesignerMagazynState(params: UseDesignerMagazynStateParams) {
  const { layout, products, selectedRackIdForSideView } = params;

  /** Selected rack for Magazyn view (for product/location and display rack). */
  const selectedRackForMagazyn = useMemo(
    () => (selectedRackIdForSideView != null ? layout.racks.find((r) => String(r.id ?? r.rack_index) === String(selectedRackIdForSideView)) ?? null : null),
    [layout.racks, selectedRackIdForSideView]
  );
  /** Set of location_id / label values for bins in the selected rack (for filtering products to this rack only). */
  const selectedRackBinLabels = useMemo(() => {
    if (!selectedRackForMagazyn) return new Set<string>();
    return new Set(
      selectedRackForMagazyn.bins
        .map((b) => (b.label ?? b.location_id ?? "").trim())
        .filter(Boolean)
    );
  }, [selectedRackForMagazyn]);
  /** Set of locationUUIDs for bins in the selected rack (for filtering by assignedLocations). */
  const selectedRackBinUUIDs = useMemo(() => {
    if (!selectedRackForMagazyn) return new Set<string>();
    return new Set(
      selectedRackForMagazyn.bins
        .map((b) => b.locationUUID)
        .filter((u): u is string => Boolean(u))
    );
  }, [selectedRackForMagazyn]);
  /** Helper: used volume (dm³) at a bin from products (location_id or assignedLocations by locationUUID). Uses safe parsing for decimals. */
  const usedVolumeAtBin = useCallback(
    (bin: BinState) => {
      const locId = (bin.label ?? bin.location_id ?? "").trim();
      const uuid = bin.locationUUID;
      let used = 0;
      for (const p of products) {
        const vol = safeVolumeDm3(p.volume_dm3);
        if (uuid && p.assignedLocations?.length) {
          const a = p.assignedLocations.find((a) => a.locationUUID === uuid);
          if (a) used += safeQuantity(a.quantity) * vol;
        } else if (locId && p.location_id === locId) {
          used += safeQuantity(p.quantity) * vol;
        }
      }
      return used;
    },
    [products]
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
  /** Per-bin total quantity (szt.) and unique product count for grid display. */
  const binItemCounts = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const out: Record<string, number> = {};
    for (const b of selectedRackForMagazyn.bins) {
      const locId = (b.label ?? b.location_id ?? "").trim();
      const uuid = b.locationUUID;
      let qty = 0;
      for (const p of products) {
        if (uuid && p.assignedLocations?.length) {
          const a = p.assignedLocations.find((a) => a.locationUUID === uuid);
          if (a) qty += safeQuantity(a.quantity);
        } else if (locId && p.location_id === locId) qty += safeQuantity(p.quantity);
      }
      out[`${b.level_index}-${b.segment_index}`] = qty;
    }
    return out;
  }, [selectedRackForMagazyn, products]);
  /** Per-bin count of different products (unique product rows in that bin). */
  const binUniqueProductCounts = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const out: Record<string, number> = {};
    for (const b of selectedRackForMagazyn.bins) {
      const locId = (b.label ?? b.location_id ?? "").trim();
      const uuid = b.locationUUID;
      const seen = new Set<string>();
      for (const p of products) {
        if (uuid && p.assignedLocations?.length) {
          if (p.assignedLocations.some((a) => a.locationUUID === uuid)) seen.add(p.id);
        } else if (locId && p.location_id === locId) seen.add(p.id);
      }
      out[`${b.level_index}-${b.segment_index}`] = seen.size;
    }
    return out;
  }, [selectedRackForMagazyn, products]);

  /** Per-bin load in kg: Σ(productWeight × quantity) for products in that bin; productWeight = weight_kg ?? weight ?? 0. */
  const binLoadKg = useMemo(() => {
    if (!selectedRackForMagazyn) return {};
    const out: Record<string, number> = {};
    for (const b of selectedRackForMagazyn.bins) {
      const locId = (b.label ?? b.location_id ?? "").trim();
      const uuid = b.locationUUID;
      let load = 0;
      for (const p of products) {
        const weight = (p as { weight_kg?: number; weight?: number }).weight_kg ?? (p as { weight?: number }).weight ?? 0;
        const productWeight = Number(weight);
        if (!Number.isFinite(productWeight) || productWeight < 0) continue;
        let qty = 0;
        if (uuid && p.assignedLocations?.length) {
          const a = p.assignedLocations.find((a) => a.locationUUID === uuid);
          if (a) qty = safeQuantity(a.quantity);
        } else if (locId && p.location_id === locId) qty = safeQuantity(p.quantity);
        load += productWeight * qty;
      }
      const safeLoad = Number.isFinite(load) ? load : 0;
      out[`${b.level_index}-${b.segment_index}`] = safeLoad;
    }
    return out;
  }, [selectedRackForMagazyn, products]);

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

  return {
    selectedRackForMagazyn,
    selectedRackBinLabels,
    selectedRackBinUUIDs,
    displayRack,
    binItemCounts,
    binUniqueProductCounts,
    binLoadKg,
    levelLoadKg,
    usedVolumeAtBin,
  };
}
