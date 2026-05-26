import type { CustomRackTemplate, LayoutState, LevelConfigItem } from "../../../../types/warehouse";

export type WarehouseReportVariant =
  | "executive"
  | "operations"
  | "technical"
  | "product_locations";

export type WarehouseReportLocationBreakdown = {
  count: number;
  volumeDm3: number;
};

export type WarehouseTemplateReportRow = {
  templateId: string | null;
  label: string;
  dimensionsCm: string;
  rackCount: number;
  locationCount: number;
  levelConfig: LevelConfigItem[];
  /** Lines like "[A][B][C]" per level (low level first). */
  gridLines: string[];
};

export type WarehouseReportMetrics = {
  exportDate: Date;
  buildingWidthM: number;
  buildingDepthM: number;
  buildingHeightM: number;
  surfaceM2: number;
  buildingVolumeM3: number;
  totalCapacityDm3: number;
  usedVolumeDm3: number;
  utilizationPct: number;
  primary: WarehouseReportLocationBreakdown;
  reserve: WarehouseReportLocationBreakdown;
  damaged: WarehouseReportLocationBreakdown;
  templates: WarehouseTemplateReportRow[];
};

export type WarehouseReportPdfContext = {
  layout: LayoutState;
  customTemplates: CustomRackTemplate[];
  gridUnitCm: number;
  metrics: WarehouseReportMetrics;
  /** Sum of quantity × purchase_price for inventory rows at layout locations. */
  warehouseValuePln: number;
};
