import { formatWarehouseLocationTypeLabel } from "../../utils/warehouseLocationTypeLabels";
import { LocationTypeBadge } from "./LocationTypeBadge";

export { formatWarehouseLocationTypeLabel } from "../../utils/warehouseLocationTypeLabels";

/** WMS / API location kinds → existing storage-type styling (LocationTypeBadge + normalizeStorageType). */
export type WmsLocationBadgeKind = "PICK" | "BUFFER" | "BULK" | "INBOUND" | "OUTBOUND";

/**
 * Maps WMS badge kind to `storage_type` strings consumed by {@link normalizeStorageType}.
 * Reuses warehouse + product location visuals (no duplicate color system).
 */
export function wmsLocationKindToStorageType(kind: string): unknown {
  const k = (kind || "").trim().toUpperCase();
  switch (k) {
    case "PICK":
      return "primary";
    case "BUFFER":
      return "reserve";
    case "BULK":
      return "buffer";
    case "INBOUND":
      return "pick";
    case "OUTBOUND":
      return "damaged";
    default:
      return "unknown";
  }
}

export type LocationBadgeProps = {
  code: string;
  type: WmsLocationBadgeKind | string;
  /**
   * When set (e.g. `storage_type` from API / layout Bin), passed to {@link LocationTypeBadge} directly
   * so colors/icons match the warehouse map. Falls back to mapping from `type` (WMS badge kind).
   */
  storageType?: unknown;
  quantity?: number;
  className?: string;
  layoutSpread?: boolean;
};

/**
 * Unified location row for WMS putaway and lists: same chrome as product/warehouse {@link LocationTypeBadge}.
 */
export function LocationBadge({ code, type, storageType, quantity, className, layoutSpread }: LocationBadgeProps) {
  const st = storageType !== undefined && storageType !== null && storageType !== "" ? storageType : wmsLocationKindToStorageType(type);
  return (
    <LocationTypeBadge
      locationText={code}
      quantity={quantity}
      storageType={st}
      className={className}
      layoutSpread={layoutSpread}
    />
  );
}
