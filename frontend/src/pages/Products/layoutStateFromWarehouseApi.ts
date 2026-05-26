/**
 * Build `LayoutState` from GET /warehouse/layout payload (`layout` object).
 * Mirrors `WarehouseDesigner.loadLayout` mapping so the map matches Magazyn / designer.
 */
import type { BinState, InternalStructure, LayoutState, VisualElementType, VisualElementState } from "../../types/warehouse";
import { clampGridToBuilding, generateRackUuid } from "../../components/warehouse/warehouseUtils";
import { normalizeStorageType } from "../../utils/storageTypes";
import { CELLS_PER_METER, GRID_COLS, GRID_ROWS } from "../WarehouseDesigner/DesignerRackPlacement";

export function layoutStateFromWarehouseApiPayload(d: Record<string, unknown>, warehouseId: number): LayoutState {
  const rawGridCols = (d.grid_cols ?? 24) <= 24 ? Number(d.grid_cols ?? 24) * CELLS_PER_METER : Number(d.grid_cols ?? GRID_COLS);
  const rawGridRows = (d.grid_rows ?? 16) <= 16 ? Number(d.grid_rows ?? 16) * CELLS_PER_METER : Number(d.grid_rows ?? GRID_ROWS);
  const building_width_m = d.building_width_m != null && Number(d.building_width_m) > 0 ? Number(d.building_width_m) : undefined;
  const building_depth_m = d.building_depth_m != null && Number(d.building_depth_m) > 0 ? Number(d.building_depth_m) : (d.building_height_m != null && Number(d.building_height_m) > 0 ? Number(d.building_height_m) : undefined);
  const building_height_m = d.building_height_m != null && Number(d.building_height_m) >= 0 ? Number(d.building_height_m) : undefined;

  return clampGridToBuilding({
    layout_id: (d.layout_id as number | null | undefined) ?? null,
    warehouse_id: (d.warehouse_id as number | undefined) ?? warehouseId,
    warehouse_name: String(d.warehouse_name ?? ""),
    name: String(d.name ?? "Layout 1"),
    grid_cols: rawGridCols,
    grid_rows: rawGridRows,
    building_width_m,
    building_depth_m,
    building_height_m,
    racks: ((d.racks || []) as Record<string, unknown>[]).map((r) => {
      const isOldFormat = Number(d.grid_cols ?? 24) <= 24;
      const scale = isOldFormat ? CELLS_PER_METER : 1;
      const rawBins = (r.bins as Record<string, unknown>[] | undefined) ?? [];
      const bins: BinState[] = Array.isArray(rawBins)
        ? rawBins.map((b, bi) => {
            const rid = (r as { id?: number; rack_index?: number }).id ?? (r as { rack_index?: number }).rack_index ?? 0;
            return {
              id: typeof (b as { id?: number }).id === "number" ? (b as { id: number }).id : undefined,
              label: String((b as { label?: string }).label ?? ""),
              level_index: Number((b as { level_index?: number }).level_index ?? 0),
              segment_index: Number((b as { segment_index?: number }).segment_index ?? 0),
              volume_dm3: Number((b as { volume_dm3?: number }).volume_dm3 ?? 0),
              current_load_dm3: Number(
                (b as { current_load_dm3?: number }).current_load_dm3 ?? (b as { used_volume_dm3?: number }).used_volume_dm3 ?? 0,
              ),
              location_id:
                typeof (b as { location_id?: string }).location_id === "string"
                  ? (b as { location_id: string }).location_id
                  : String((b as { label?: string }).label ?? ""),
              locationUUID:
                typeof (b as { location_uuid?: string }).location_uuid === "string"
                  ? (b as { location_uuid: string }).location_uuid
                  : typeof (b as { locationUUID?: string }).locationUUID === "string"
                    ? (b as { locationUUID: string }).locationUUID
                    : `gen-${rid}-${(b as { level_index?: number }).level_index ?? 0}-${(b as { segment_index?: number }).segment_index ?? bi}`,
              width_cm: typeof (b as { width_cm?: number }).width_cm === "number" ? (b as { width_cm: number }).width_cm : undefined,
              depth_cm: typeof (b as { depth_cm?: number }).depth_cm === "number" ? (b as { depth_cm: number }).depth_cm : undefined,
              height_cm: typeof (b as { height_cm?: number }).height_cm === "number" ? (b as { height_cm: number }).height_cm : undefined,
              barcode_data:
                typeof (b as { barcode_data?: string }).barcode_data === "string"
                  ? (b as { barcode_data: string }).barcode_data
                  : String((b as { label?: string }).label ?? ""),
              storage_type: normalizeStorageType((b as { storage_type?: string }).storage_type),
            };
          })
        : [];
      return {
        id: r.id as number | undefined,
        uuid: typeof r.uuid === "string" && r.uuid.trim() !== "" ? r.uuid : generateRackUuid(),
        rack_type: (r as { rack_type?: string }).rack_type === "store" ? ("store" as const) : ("warehouse" as const),
        name: typeof r.name === "string" ? r.name.trim() || undefined : undefined,
        x: Number(r.x) * scale,
        y: Number(r.y) * scale,
        width: Math.max(1, Number(r.width ?? 1) * scale),
        height: Math.max(1, Number(r.height ?? 1) * scale),
        orientation: String(r.orientation ?? "vertical"),
        levels: Number(r.levels ?? 4),
        bins_per_level: Number(r.bins_per_level ?? 4),
        levelConfig:
          Array.isArray(r.level_config) && r.level_config.length > 0
            ? (r.level_config as { level?: number; locations?: number }[]).map((row) => ({
                level: Number(row.level ?? 0),
                locations: Number(row.locations ?? 1),
              }))
            : undefined,
        length_cm: Number(r.length_cm ?? 100),
        width_cm: Number(r.width_cm ?? 80),
        height_cm: Number(r.height_cm ?? 200),
        aisle_letter: String(r.aisle_letter ?? "A"),
        rack_index: Number(r.rack_index ?? 1),
        bins,
        internal_structure: ((r.internal_structure as InternalStructure | null) ?? null) as InternalStructure | null,
        total_capacity_dm3: Number(r.total_capacity_dm3 ?? 0),
        used_dm3: Number(r.used_dm3 ?? 0),
        color: typeof r.color === "string" && r.color.trim() !== "" ? r.color.trim() : "#3b82f6",
        templateId:
          typeof r.templateId === "string"
            ? r.templateId
            : typeof (r as { template_id?: unknown }).template_id === "string"
              ? (r as { template_id: string }).template_id
              : undefined,
        level_max_load_kg:
          typeof (r as { level_max_load_kg?: number }).level_max_load_kg === "number"
            ? (r as { level_max_load_kg: number }).level_max_load_kg
            : undefined,
        show_label: typeof r.show_label === "boolean" ? r.show_label : undefined,
        rowPrefix:
          typeof (r as { row_prefix?: string }).row_prefix === "string"
            ? (r as { row_prefix: string }).row_prefix.trim() || undefined
            : typeof (r as { rowPrefix?: string }).rowPrefix === "string"
              ? (r as { rowPrefix: string }).rowPrefix.trim() || undefined
              : undefined,
        indexInRow:
          typeof (r as { index_in_row?: number }).index_in_row === "number"
            ? (r as { index_in_row: number }).index_in_row
            : typeof (r as { indexInRow?: number }).indexInRow === "number"
              ? (r as { indexInRow: number }).indexInRow
              : undefined,
      };
    }),
    aisles: ((d.aisles || []) as Record<string, unknown>[]).map((a) => ({
      id: a.id as number | undefined,
      name: a.name as string | undefined,
      x: Number(a.x),
      y: Number(a.y),
      width: Number(a.width ?? 1),
      height: Number(a.height ?? 1),
      two_way: Boolean(a.two_way),
    })),
    visual_elements: Array.isArray(d.visual_elements)
      ? (d.visual_elements as Record<string, unknown>[]).map((ve) => ({
          id: String(ve.id ?? `ve-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
          type: (["column", "mezzanine", "packing_station", "cart", "wall", "door", "zone"] as const).includes(String(ve.type) as VisualElementType)
            ? (String(ve.type) as VisualElementType)
            : "column",
          x: Number(ve.x ?? 0),
          y: Number(ve.y ?? 0),
          width: Number(ve.width ?? 1),
          height: Number(ve.height ?? 1),
          zIndex: Number(ve.zIndex ?? 0),
          name: typeof ve.name === "string" ? ve.name : undefined,
          label: typeof ve.label === "string" ? ve.label : undefined,
          length: typeof ve.length === "number" ? ve.length : undefined,
          thickness: typeof ve.thickness === "number" ? ve.thickness : undefined,
          doorStyle: ve.doorStyle === "sliding" || ve.doorStyle === "hinged" ? ve.doorStyle : undefined,
          zoneType: ve.zoneType === "shipping" || ve.zoneType === "reception" ? ve.zoneType : undefined,
          color: typeof ve.color === "string" ? ve.color : undefined,
          rotation: typeof ve.rotation === "number" ? ve.rotation : undefined,
          columnShape: ve.columnShape === "circle" || ve.columnShape === "rectangle" ? ve.columnShape : undefined,
          diameter: typeof ve.diameter === "number" ? ve.diameter : undefined,
          width_cm: typeof ve.width_cm === "number" ? ve.width_cm : undefined,
          depth_cm: typeof ve.depth_cm === "number" ? ve.depth_cm : undefined,
          height_cm: typeof ve.height_cm === "number" ? ve.height_cm : undefined,
          total_volume_dm3: typeof ve.total_volume_dm3 === "number" ? ve.total_volume_dm3 : undefined,
          current_occupancy_dm3: typeof ve.current_occupancy_dm3 === "number" ? ve.current_occupancy_dm3 : undefined,
        }))
      : [],
    picking_path: Array.isArray(d.picking_path) ? (d.picking_path as { x: number; y: number }[]) : undefined,
    row_containers: Array.isArray(d.row_containers) ? (d.row_containers as LayoutState["row_containers"]) : [],
    wall_elements: Array.isArray(d.wall_elements)
      ? (d.wall_elements as Array<Record<string, unknown>>).map((we) => ({
          id: String(we.id ?? `we-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
          type: we.type === "gate" ? ("gate" as const) : ("door" as const),
          wall: (["north", "south", "east", "west"] as const).includes(String(we.wall) as "north" | "south" | "east" | "west")
            ? (String(we.wall) as "north" | "south" | "east" | "west")
            : "north",
          position_cm: Number(we.position_cm ?? 0),
          width_cm: Number(we.width_cm ?? 120),
          gateType: we.gateType === "courier" || we.gateType === "supplier" || we.gateType === "both" ? we.gateType : undefined,
        }))
      : [],
  });
}
