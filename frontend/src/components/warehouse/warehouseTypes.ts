/** Re-export from shared types – use src/types/warehouse.ts as single source of truth */
export type {
  BinState,
  InternalLocation,
  InternalLevel,
  InternalStructure,
  LevelConfigItem,
  RackLevel,
  RackPosition,
  RackState,
  StorageType,
  AisleState,
  LayoutState,
  RackTemplate,
  CatalogPresetId,
  CustomRackTemplate,
  CatalogItem,
  VisualElementType,
  VisualElementState,
} from "../../types/warehouse";
export { GRID_UNIT_CM, CATALOG_PRESETS } from "../../types/warehouse";
