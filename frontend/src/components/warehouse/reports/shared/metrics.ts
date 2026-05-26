import type { CustomRackTemplate, LayoutState, RackState } from "../../../../types/warehouse";
import { GRID_UNIT_CM } from "../../../../types/warehouse";
import { getLevelConfig } from "../../warehouseUtils";
import type { WarehouseReportLocationBreakdown, WarehouseReportMetrics, WarehouseTemplateReportRow } from "./types";
import { formatLevelConfigAsGridLines, resolveTemplateLevelConfig } from "./templateGrid";

function rackLocationCount(rack: RackState): number {
  const lc = rack.levelConfig;
  if (lc && lc.length > 0) return lc.reduce((s, x) => s + x.locations, 0);
  return Math.max(0, rack.levels) * Math.max(1, rack.bins_per_level);
}

/**
 * Groups racks strictly by `templateId`. Racks without template are under key `__no_template__`.
 */
export function buildWarehouseReportMetrics(
  layout: LayoutState,
  customTemplates: CustomRackTemplate[],
  totalCapacityDm3: number,
  usedVolumeDm3: number,
  utilizationPct: number,
  primary: WarehouseReportLocationBreakdown,
  reserve: WarehouseReportLocationBreakdown,
  damaged: WarehouseReportLocationBreakdown
): WarehouseReportMetrics {
  const w = layout.building_width_m ?? (layout.grid_cols * GRID_UNIT_CM) / 100;
  const depthM =
    layout.building_depth_m ?? layout.building_height_m ?? (layout.grid_rows * GRID_UNIT_CM) / 100;
  const h = layout.building_height_m ?? 0;
  const surfaceM2 = w * depthM;
  const buildingVolumeM3 = w > 0 && depthM > 0 && h > 0 ? w * depthM * h : surfaceM2 * (h || 0);

  const tplById = new Map(customTemplates.map((t) => [t.id, t]));

  type Agg = {
    templateId: string | null;
    label: string;
    rackCount: number;
    locationCount: number;
    sort: string;
    widthCm: number;
    depthCm: number;
    heightCm: number;
    representativeRack: RackState;
  };

  const groups = new Map<string, Agg>();

  for (const rack of layout.racks) {
    const tid = rack.templateId ?? null;
    const key = tid ?? "__no_template__";
    const tpl = tid ? tplById.get(tid) : undefined;
    const locCount = rackLocationCount(rack);
    const label =
      tpl?.name ??
      (tid ? `Szablon ${tid}` : rack.name ? String(rack.name) : "Bez szablonu (wymiary z regału)");
    const sort = (tpl?.name ?? label).toLowerCase();
    const widthCm = tpl?.width_cm ?? rack.width_cm;
    const depthCm = tpl?.depth_cm ?? rack.length_cm;
    const heightCm = tpl?.height_cm ?? rack.height_cm;
    const prev = groups.get(key);
    if (prev) {
      prev.rackCount += 1;
      prev.locationCount += locCount;
    } else {
      groups.set(key, {
        templateId: tid,
        label,
        rackCount: 1,
        locationCount: locCount,
        sort,
        widthCm,
        depthCm,
        heightCm,
        representativeRack: rack,
      });
    }
  }

  const templates: WarehouseTemplateReportRow[] = [...groups.entries()]
    .map(([, g]) => {
      const rack = g.representativeRack;
      const lc = resolveTemplateLevelConfig(rack, tplById);
      const levelConfig = lc.length > 0 ? lc : getLevelConfig(rack);
      const gridLines = formatLevelConfigAsGridLines(levelConfig);
      return {
        templateId: g.templateId,
        label: g.label,
        dimensionsCm: `${Math.round(g.widthCm)}×${Math.round(g.depthCm)}×${Math.round(g.heightCm)}`,
        rackCount: g.rackCount,
        locationCount: g.locationCount,
        levelConfig,
        gridLines,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pl"));

  return {
    exportDate: new Date(),
    buildingWidthM: w,
    buildingDepthM: depthM,
    buildingHeightM: h,
    surfaceM2,
    buildingVolumeM3,
    totalCapacityDm3,
    usedVolumeDm3,
    utilizationPct,
    primary,
    reserve,
    damaged,
    templates,
  };
}
