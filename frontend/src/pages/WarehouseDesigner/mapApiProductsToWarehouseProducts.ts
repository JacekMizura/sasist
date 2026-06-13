import type { LayoutState, WarehouseProduct } from "../../types/warehouse";
import { normalizeProductDims } from "../../utils/productNormalizer";
import { resolveLocationLabelByUuid } from "../../utils/resolvedWarehouseLocation";
import { safeQuantity, safeVolumeDm3 } from "./DesignerRackPlacement";

function assignedLocationEntryUuid(a: {
  locationUUID?: string;
  location_uuid?: string;
}): string | undefined {
  if (typeof a.locationUUID === "string" && a.locationUUID.trim() !== "") return a.locationUUID.trim();
  if (typeof a.location_uuid === "string" && a.location_uuid.trim() !== "") return a.location_uuid.trim();
  return undefined;
}

export function mapApiProductsToWarehouseProducts(
  raw: Record<string, unknown>[],
  layout: LayoutState,
): WarehouseProduct[] {
  const resolveLabel = (locationUUID: string): string | null =>
    resolveLocationLabelByUuid(layout, locationUUID);

  return raw.map((p) => {
    const id = p.id != null ? String(p.id) : `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const assigned = (
      Array.isArray(p.assigned_locations)
        ? p.assigned_locations
        : Array.isArray(p.assignedLocations)
          ? p.assignedLocations
          : []
    ) as Array<{ locationUUID: string; quantity: number; location_uuid?: string }>;
    const totalQty = assigned.reduce((s: number, a: { quantity?: unknown }) => s + safeQuantity(a.quantity), 0);
    const vol = safeVolumeDm3(p.volume);
    const firstLoc = assigned[0];
    const firstLocUuid = firstLoc ? assignedLocationEntryUuid(firstLoc) : undefined;
    const location_id = firstLocUuid ? resolveLabel(firstLocUuid) : null;
    const weightKg = typeof p.weight_kg === "number" ? p.weight_kg : typeof p.weight === "number" ? p.weight : undefined;
    const dims = normalizeProductDims(p);
    return {
      id,
      name: String(p.name ?? ""),
      sku: String(p.symbol ?? p.sku ?? ""),
      ean: String(p.ean ?? ""),
      quantity: totalQty || safeQuantity(p.quantity),
      volume_dm3: vol,
      location_id: location_id ?? null,
      assignedLocations: assigned.length > 0 ? assigned : undefined,
      weight_kg: weightKg,
      image_url: typeof p.image_url === "string" ? p.image_url : undefined,
      width_cm: dims.width_cm || undefined,
      depth_cm: dims.depth_cm || undefined,
      height_cm: dims.height_cm || undefined,
      orientation_type: ["any", "upright", "no_stack"].includes(String((p as { orientation_type?: string }).orientation_type))
        ? (p as { orientation_type: "any" | "upright" | "no_stack" }).orientation_type
        : "any",
      shape_type: ["box", "cylinder"].includes(String((p as { shape_type?: string }).shape_type))
        ? (p as { shape_type: "box" | "cylinder" }).shape_type
        : "box",
      stack_compressible: (p as { stack_compressible?: boolean }).stack_compressible ?? false,
      compressed_height_cm: (p as { compressed_height_cm?: number | null }).compressed_height_cm ?? null,
      max_stack_weight: (p as { max_stack_weight?: number | null }).max_stack_weight ?? null,
      stack_behavior: ["stackable", "no_stack"].includes(String((p as { stack_behavior?: string }).stack_behavior))
        ? (p as { stack_behavior: "stackable" | "no_stack" }).stack_behavior
        : "stackable",
      purchase_price:
        typeof p.purchase_price === "number" && Number.isFinite(p.purchase_price) ? p.purchase_price : undefined,
    };
  });
}
