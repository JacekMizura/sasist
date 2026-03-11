import { useMemo } from "react";
import api from "../../api/axios";
import type { LayoutState, WarehouseProduct } from "../../types/warehouse";
import type { EditProductModalProps } from "../../components/warehouse/EditProductModal";
import { TENANT_ID, safeQuantity, safeVolumeDm3 } from "./DesignerRackPlacement";

export interface UseDesignerProductModalParams {
  mainView: "magazyn" | "layout";
  editingProductId: string | null;
  showElevationForRackId: number | string | null;
  layout: LayoutState;
  products: WarehouseProduct[];
  setProducts: React.Dispatch<React.SetStateAction<WarehouseProduct[]>>;
  setEditingProductId: React.Dispatch<React.SetStateAction<string | null>>;
  safeQuantity: (v: unknown) => number;
  safeVolumeDm3: (v: unknown) => number;
  binVolumeDm3: (bin: { volume_dm3?: number; label?: string; location_id?: string; locationUUID?: string }, rack: { width?: number; height?: number }) => number;
  binsToLevels: (bins: unknown[]) => unknown[];
  getAllPositionsFromRacks: (racks: LayoutState["racks"]) => unknown[];
}

export function useDesignerProductModal(params: UseDesignerProductModalParams) {
  const {
    mainView,
    editingProductId,
    showElevationForRackId,
    layout,
    products,
    setProducts,
    setEditingProductId,
    safeQuantity,
    safeVolumeDm3,
    binVolumeDm3,
    binsToLevels,
    getAllPositionsFromRacks,
  } = params;

  const editProductModalProps = useMemo((): EditProductModalProps | null => {
    if (mainView !== "layout" || editingProductId == null || showElevationForRackId == null) return null;
    const rackForModal = layout.racks.find((r) => String(r.id ?? r.rack_index) === String(showElevationForRackId)) ?? null;
    if (!rackForModal) return null;
    return {
      product: editingProductId === "new" ? null : products.find((p) => p.id === editingProductId) ?? null,
      locationOptions: rackForModal.bins.map((b) => ({ value: b.label ?? b.location_id ?? "", label: b.label ?? b.location_id ?? "" })),
      positionsForPicker: getAllPositionsFromRacks(layout.racks),
      initialLocationId: undefined,
      getBinCapacityDm3: (locId) => {
        const b = rackForModal.bins.find((bin) => (bin.label ?? bin.location_id) === locId);
        return b ? binVolumeDm3(b, rackForModal) : 0;
      },
      getBinUsedVolumeDm3: (locId, excludeProductId) =>
        products
          .filter((p) => p.location_id === locId && p.id !== excludeProductId)
          .reduce((s, p) => s + safeQuantity(p.quantity) * safeVolumeDm3(p.volume_dm3), 0),
      getMaxQuantityByUUID: (locationUUID, excludeProductId, volumePerUnitDm3) => {
        const rack = layout.racks.find((r) =>
          (r.rackLevels ?? binsToLevels(r.bins ?? [])).some((lev) =>
            lev.positions.some((pos) => pos.locationUUID === locationUUID)
          )
        );
        if (!rack) return undefined;
        const bin = rack.bins.find((b) => b.locationUUID === locationUUID);
        if (!bin) return undefined;
        const capacityDm3 = binVolumeDm3(bin, rack);
        if (capacityDm3 <= 0) return undefined;
        let usedDm3 = 0;
        for (const p of products) {
          if (p.id === excludeProductId) continue;
          const vol = safeVolumeDm3(p.volume_dm3);
          if (p.assignedLocations?.length) {
            const a = p.assignedLocations.find((a) => a.locationUUID === locationUUID);
            if (a) usedDm3 += safeQuantity(a.quantity) * vol;
          } else if ((p.location_id && bin.label === p.location_id) || (bin.location_id && p.location_id === bin.location_id))
            usedDm3 += safeQuantity(p.quantity) * vol;
        }
        const freeDm3 = Math.max(0, capacityDm3 - usedDm3);
        if (volumePerUnitDm3 == null || volumePerUnitDm3 <= 0) return undefined;
        return Math.floor(freeDm3 / volumePerUnitDm3);
      },
      getUsedVolumeDm3ByUUID: (locationUUID) => {
        const excludeProductId = editingProductId === "new" ? undefined : editingProductId;
        let usedDm3 = 0;
        for (const p of products) {
          if (p.id === excludeProductId) continue;
          const vol = safeVolumeDm3(p.volume_dm3);
          if (p.assignedLocations?.length) {
            const a = p.assignedLocations.find((a) => a.locationUUID === locationUUID);
            if (a) usedDm3 += safeQuantity(a.quantity) * vol;
          } else {
            const rack = layout.racks.find((r) =>
              (r.rackLevels ?? binsToLevels(r.bins ?? [])).some((lev) =>
                lev.positions.some((pos) => pos.locationUUID === locationUUID)
              )
            );
            const bin = rack?.bins.find((b) => b.locationUUID === locationUUID);
            if (bin && ((p.location_id && bin.label === p.location_id) || (bin.location_id && p.location_id === bin.location_id)))
              usedDm3 += safeQuantity(p.quantity) * vol;
          }
        }
        return usedDm3;
      },
      getAvailableQuantity: (key, excludeProductId) => {
        const sameProduct = (p: WarehouseProduct) => {
          if (p.name.trim().toLowerCase() !== key.name.trim().toLowerCase()) return false;
          if (key.sku?.trim()) return p.sku?.trim() === key.sku.trim();
          if (key.ean?.trim()) return p.ean?.trim() === key.ean.trim();
          return true;
        };
        const assigned = products
          .filter((p) => sameProduct(p) && p.id !== excludeProductId)
          .reduce((s, p) => s + (p.assignedLocations?.reduce((t, a) => t + a.quantity, 0) ?? p.quantity), 0);
        return Math.max(0, 999999 - assigned);
      },
      onSave: (payload) => {
        const next = {
          ...payload,
          location_id: payload.location_id || null,
          assignedLocations: payload.assignedLocations,
          image_url: payload.image_url ?? undefined,
        };
        if (editingProductId !== "new" && editingProductId != null) {
          setProducts((prev) => prev.map((q) => (q.id === editingProductId ? { ...q, ...next } : q)));
          const numericId = Number(editingProductId);
          if (Number.isInteger(numericId) && numericId > 0) {
            api.put(`/products/${numericId}/`, {
              name: next.name,
              ean: next.ean ?? "",
              symbol: next.sku ?? "",
              assigned_locations: next.assignedLocations ?? [],
              tenant_id: TENANT_ID,
            }, { params: { tenant_id: TENANT_ID } }).catch(() => {});
          }
        } else {
          setProducts((prev) => [...prev, { ...next, id: `p${Date.now()}` }]);
        }
        setEditingProductId(null);
      },
      onClose: () => setEditingProductId(null),
    };
  }, [
    mainView,
    editingProductId,
    showElevationForRackId,
    layout.racks,
    products,
    safeQuantity,
    safeVolumeDm3,
    binVolumeDm3,
    binsToLevels,
    getAllPositionsFromRacks,
  ]);

  return { editProductModalProps };
}
