/**
 * Shared warehouse designer types – single source of truth for all components.
 */

export const GRID_UNIT_CM = 10;

export type StorageType = "primary" | "reserve" | "store" | "buffer" | "damaged";
export type RackType = "warehouse" | "store";

export type BinState = {
  id?: number;
  label: string;
  level_index: number;
  segment_index: number;
  /** Computed: (width_cm * depth_cm * height_cm) / 1000 when dimensions set; else stored value */
  volume_dm3: number;
  /** Used capacity in dm³; alias current_load_dm3 for backward compat */
  current_load_dm3?: number;
  used_volume_dm3?: number;
  /** Physical dimensions (cm). When set, volume_dm3 = (w*d*h)/1000 */
  width_cm?: number;
  depth_cm?: number;
  height_cm?: number;
  /** Unique location id e.g. M1-A-04-02-01 (WH-SEC-ROW-LEV-BIN) */
  location_id?: string;
  /** Permanent unique id for this storage position (e.g. UUID). Used for "Product X is in Row A, Rack 1, Level 2, Position 3". */
  locationUUID?: string;
  /** Barcode string for label printing */
  barcode_data?: string;
  /** Storage type for the slot. Unknown values should be normalized to primary. */
  storage_type?: StorageType;
};

/** One assigned warehouse location for a product: position UUID and quantity at that spot. */
export type AssignedLocation = {
  locationUUID: string;
  quantity: number;
  /** Human-readable address (e.g. A1-4-1). Optional, set when saving from location picker. */
  locationAddress?: string;
  /** Storage type for the assigned position. Optional, set when saving from picker. */
  storageType?: StorageType;
};

/** Product in warehouse inventory (for Magazyn view); location_id matches bin.label or bin.location_id */
export type WarehouseProduct = {
  id: string;
  name: string;
  sku: string;
  ean: string;
  quantity: number;
  /** Unit volume in dm³ (total in bin = quantity * volume_dm3) */
  volume_dm3: number;
  /** Assigned bin: bin.label or bin.location_id; null = unassigned. Kept for backward compat; prefer assignedLocations. */
  location_id: string | null;
  /** Per-position assignments (Row/Rack/Level/Position). When set, total quantity can be sum of these. */
  assignedLocations?: AssignedLocation[];
  /** Unit weight in kg; used for level load calculation (bin_load_kg = Σ weight_kg × quantity). API may also return as weight. */
  weight_kg?: number;
  /** Alternative weight field (kg); prefer weight_kg. Used when mapping from API that returns "weight". */
  weight?: number;
  image_url?: string;
  /** Physical dimensions (cm). When set, used for physical slot capacity (3D bin packing). May come from API. */
  width_cm?: number;
  depth_cm?: number;
  height_cm?: number;
  /** Orientation constraint for packing: any | upright | no_stack. Null/undefined → any. */
  orientation_type?: "any" | "upright" | "no_stack";
  /** Shape: box | cylinder. Null/undefined → box. */
  shape_type?: "box" | "cylinder";
  /** Stack compression (e.g. pillows, quilts). Null/undefined → false. */
  stack_compressible?: boolean;
  /** Height (cm) when stacked/compressed. Used when stack_compressible is true. */
  compressed_height_cm?: number | null;
  /** Max total weight (kg) of stack; limits stack height by weight. */
  max_stack_weight?: number | null;
  /** Stacking: stackable (default) | no_stack. When no_stack, countZ = 1. */
  stack_behavior?: "stackable" | "no_stack";
};

export interface InternalLocation {
  width_cm: number;
  /** Depth (cm); required for volume calculations */
  depth_cm: number;
  /** Height (cm); required for volume calculations */
  height_cm: number;
}

export interface InternalLevel {
  height_cm: number;
  locations: InternalLocation[];
}

/** Single node of the picking path (for ordered path with id) */
export interface PathNode {
  id: string;
  x: number;
  y: number;
  order: number;
}

export type InternalStructure = { levels: InternalLevel[] };

/** Per-level configuration: level (1-based) and number of storage locations on that level. */
export type LevelConfigItem = {
  level: number;
  locations: number;
  /** Beam (travers) directly below this level in cm. Top level has no beamBelowCm. */
  beamBelowCm?: number;
};

/** Single storage position within a level (smallest addressable unit). */
export type RackPosition = {
  positionIndex: number;
  /** Permanent unique id for this position. */
  locationUUID: string;
  /** Human-readable address e.g. A-01-02-03 (Row-Rack-Level-Position). */
  locationAddress: string;
  volume_dm3?: number;
  used_volume_dm3?: number;
  /** Max dimensions (cm) for fit-check: product must not exceed these. */
  max_depth_cm?: number;
  max_width_cm?: number;
  max_height_cm?: number;
  /** Storage type for the position. Unknown values should be normalized to primary. */
  storage_type?: StorageType;
};

/** One level of a rack, containing multiple positions. */
export type RackLevel = {
  levelIndex: number;
  positions: RackPosition[];
};

export type RackState = {
  id?: number;
  uuid?: string;
  rack_type: RackType;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: string;
  /** Number of levels (used when levelConfig is absent). */
  levels: number;
  /** Locations per level when uniform (used when levelConfig is absent). */
  bins_per_level: number;
  /** When set, overrides levels/bins_per_level: each entry defines locations for that level (1-based). */
  levelConfig?: LevelConfigItem[];
  length_cm: number;
  width_cm: number;
  height_cm: number;
  aisle_letter: string;
  rack_index: number;
  bins: BinState[];
  /** Levels and positions with permanent locationUUIDs. When set, use for sub-location addressing; otherwise derived from bins. */
  rackLevels?: RackLevel[];
  internal_structure?: InternalStructure | null;
  /** Unified resolved layout override used by editor/views when structure diverges from template/base. */
  layoutVariant?: {
    levels: LevelConfigItem[];
    internal_structure?: InternalStructure | null;
  } | null;
  total_capacity_dm3?: number;
  used_dm3?: number;
  /** Optional fill color for map display (hex) */
  color?: string;
  /** Custom template id when placed from catalog (for edit propagation) */
  templateId?: string;
  /** Max allowed load per level in kg (from template). Used for level load capacity display. */
  level_max_load_kg?: number;
  /** Show label on map (e.g. "Regał A1") */
  show_label?: boolean;
  /** Dynamic row label: prefix (e.g. "G") and index in that row (1,2,3…). Display label = rowPrefix.indexInRow (e.g. G.1). */
  rowPrefix?: string;
  indexInRow?: number;
  /** When 90, rack is placed in a vertical row and should be drawn rotated 90° (footprint already swapped in width/height). When 180, back-to-back row: face opposite aisle. */
  rotationDegrees?: 0 | 90 | 180;
};

export type AisleState = {
  id?: number;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  two_way: boolean;
};

/** Visual-only objects (no DB StorageLocation): columns, mezzanines, packing stations, carts, walls, doors, zones */
export type VisualElementType = "column" | "mezzanine" | "packing_station" | "cart" | "wall" | "door" | "zone";
export type ColumnShape = "square" | "rectangle" | "circle";
export type DoorStyle = "hinged" | "sliding";
export type ZoneType = "reception" | "shipping";
export type VisualElementState = {
  id: string;
  type: VisualElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Draw order (higher = on top) */
  zIndex: number;
  name?: string;
  /** Column only: square, rectangle, circle */
  columnShape?: ColumnShape;
  /** Circle column: diameter in cells */
  diameter?: number;
  /** Rotation in degrees (0–360) for any element */
  rotation?: number;
  /** Fill/border color (hex) for any visual */
  color?: string;
  /** Wall: length in cells along primary axis */
  length?: number;
  /** Wall: thickness in cells */
  thickness?: number;
  /** Door: hinged or sliding */
  doorStyle?: DoorStyle;
  /** Zone: reception or shipping (affects default color) */
  zoneType?: ZoneType;
  /** Display label on map (e.g. "Brama Północna") */
  label?: string;
  /** Zone only: physical dimensions (cm) */
  width_cm?: number;
  depth_cm?: number;
  height_cm?: number;
  /** Zone only: total capacity dm³; computed from dimensions when set */
  total_volume_dm3?: number;
  /** Zone only: current occupancy dm³ */
  current_occupancy_dm3?: number;
};

/** Picking path waypoints (cell coordinates) for persistence */
export type PickingPathState = { x: number; y: number }[];

/** A single slot in a row container. When rackId is set, the slot is filled by that rack. */
export type EmptyRowSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Set when a rack has been placed in this slot (rack_index or id). */
  rackId?: number | string;
};

/** Row container: a row of placeholder slots. Created by "Draw Row" without a template. */
export type RowContainer = {
  id: string;
  /** Row label prefix for rack indexing (e.g. "A" → A1, A2, A3). */
  rowPrefix?: string;
  /** Horizontal: slots stack left-to-right (x increases). Vertical: slots stack top-to-bottom (y increases). */
  orientation?: "horizontal" | "vertical";
  /** Rack numbering and bin column letters: LTR = first slot → 1 / A…; RTL = reversed. Default LTR. */
  direction?: "LTR" | "RTL";
  slots: EmptyRowSlot[];
};

export type WallSide = "north" | "south" | "east" | "west";

export type WallElement = {
  id: string;
  type: "door" | "gate";
  wall: WallSide;
  /** Position along wall from start (cm). */
  position_cm: number;
  /** Width along wall (cm). */
  width_cm: number;
  /** For type === "gate" only. */
  gateType?: "courier" | "supplier" | "both";
};

export type LayoutState = {
  layout_id: number | null;
  warehouse_id: number | null;
  warehouse_name: string;
  name: string;
  grid_cols: number;
  grid_rows: number;
  /** Physical building footprint (m). When set, grid_cols/grid_rows are capped to building. */
  building_width_m?: number;
  /** 2D depth (layout rows). Grid limits use width + depth only. */
  building_depth_m?: number;
  /** Physical height of the building (m). Used for layout stats/kubatura only; does NOT affect grid.
   * Must NOT be used for rack template validation. Template height uses only rack_template.height_cm and sum(level.height_cm). */
  building_height_m?: number;
  racks: RackState[];
  aisles: AisleState[];
  visual_elements: VisualElementState[];
  /** Saved manual picking path waypoints (cell coords) */
  picking_path?: PickingPathState;
  /** Empty row containers (slots). Racks can be placed into slots by dragging from catalog. */
  row_containers?: RowContainer[];
  /** Doors and loading gates on building perimeter (wall + position_cm + width_cm). */
  wall_elements?: WallElement[];
};

export type RackTemplate = {
  namePrefix: string;
  width_cm: number;
  depth_cm: number;
  height_cm: number;
  levels: number;
  bins_per_level: number;
  aisle_letter: string;
  /** Optional source custom template id used to persist rack-template linkage. */
  templateId?: string;
};

/** Catalog preset for drag-and-drop. Each has a distinct color for UI and saved racks. */
export const CATALOG_PRESETS = [
  { id: "standard", label: "Standard Rack", width_cm: 120, depth_cm: 80, height_cm: 200, levels: 4, bins_per_level: 4, aisle_letter: "A", color: "#3b82f6" },
  { id: "pallet", label: "Pallet Rack", width_cm: 120, depth_cm: 100, height_cm: 400, levels: 5, bins_per_level: 2, aisle_letter: "A", color: "#22c55e" },
  { id: "floor", label: "Floor Zone", width_cm: 200, depth_cm: 200, height_cm: 100, levels: 1, bins_per_level: 1, aisle_letter: "F", color: "#eab308" },
] as const;

export type CatalogPresetId = (typeof CATALOG_PRESETS)[number]["id"];

/** User-created template with color and optional naming pattern. {R}=Rack, {S}=Section, {L}=Level, {B}=Bin */
export type CustomRackTemplate = {
  id: string;
  /** Optional parent/base template id when this entry is a structural variant. */
  templateId?: string;
  name: string;
  width_cm: number;
  depth_cm: number;
  height_cm: number;
  levels: number;
  bins_per_level: number;
  rack_type?: RackType;
  /** When set, per-level locations (level 1-based). When absent, all levels use bins_per_level. */
  levelConfig?: LevelConfigItem[];
  /** Legacy; use naming_pattern. Default "A" when not set. */
  aisle_letter: string;
  color: string;
  /** e.g. "A-{R}-{L}-{B}" or "{S}-{R:2}-{L:2}-{B:2}". Placeholders: {R} rack, {S} section/aisle, {L} level, {B} bin. Optional :N for zero-pad (e.g. {R:2} = 01) */
  naming_pattern?: string;
  /** Address pattern with {Row}, {Section}, {Bin}, {Level}. Default "{Row}{Section}-{Bin}-{Level}". */
  addressPattern?: string;
  /** Row ID for {Row} in address pattern (e.g. "A" or "1"). */
  rowId?: string;
  /** Start section index for {Section} (e.g. 1). When autoSectionNumbering is true, row placement increments this per rack. */
  sectionStartIndex?: number;
  /** Next available section index for this template (updated after each row placement so Row A and Row B number independently). */
  nextSectionIndex?: number;
  /** When true, placing a row of racks auto-increments section (Rack 1 → Section start, Rack 2 → start+1, …). */
  autoSectionNumbering?: boolean;
  /** Bin naming: numeric (1,2,3) or alpha (A,B,C). */
  binNamingType?: "numeric" | "alpha";
  /** Per-cell storage type map keyed by "level_index-segment_index". */
  bin_type_map?: Record<string, StorageType>;
  /** Legacy reserve-only storage for backward compatibility when reading old templates. */
  reserve_bin_keys?: string[];

  /** Naming strategy: pattern (Row/Section/Bin/Level), rack-index, custom, or manual. When absent, treated as "pattern" with addressPattern. */
  namingStrategy?: "pattern" | "rack-index" | "custom" | "manual";
  /** For pattern strategy: column-first (A-1 B-1 C-1) or row-first (A-1 A-2 A-3). */
  namingOrientation?: "column-first" | "row-first";
  /** Pattern string for pattern/custom/rack-index. For pattern strategy when absent, addressPattern is used. */
  namingPattern?: string;
  /** Manual strategy: cell key "levelIndex-segmentIndex" → label. */
  manualLabels?: Record<string, string>;
  /** Per-cell overrides: same key format; applied on top of generated label. */
  overrides?: Record<string, string>;
  /** Rack-index strategy: zero-pad index to this many digits (e.g. 2 → 01, 02). */
  indexPadding?: number;
  /** Rack-index strategy: start index for first cell (default 1). */
  startIndex?: number;
  /** Max allowed load per level in kg. Default 500. Used for level load capacity visualization. */
  level_max_load_kg?: number;
};

/** Catalog item: built-in preset or custom template */
export type CatalogItem =
  | { type: "preset"; id: CatalogPresetId }
  | { type: "custom"; template: CustomRackTemplate };
