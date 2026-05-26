import type { WmsPickingCartSnapshot } from "../../context/WmsPickingCartContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

/**
 * Tenant ID for WMS picking API calls: when the cart snapshot matches the current
 * warehouse, use the tenant stored with the cart (same context as resolve-cart);
 * otherwise fall back to the panel default tenant.
 */
export function resolveWmsPickingTenantId(
  warehouseId: number | null,
  snapshot: WmsPickingCartSnapshot | null,
): number {
  if (warehouseId != null && snapshot != null && snapshot.warehouseId === warehouseId) {
    return snapshot.tenantId;
  }
  return DAMAGE_TENANT_ID;
}
