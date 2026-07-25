/**
 * Single FE entry for structure rebuild analysis + future audit.
 *
 * Every rebuild (layout save, template instances, future API) must flow here:
 * analyze → preview → gates → confirm → apply → persist.
 */

import type { CustomRackTemplate, LayoutState, RackState } from "../../types/warehouse";
import { rematerializeInheritedPassages } from "../../pages/WarehouseDesigner/passages/rackPassageGeometry";
import {
  binsToLevels,
  cmToCells,
  createBinsForRack,
  effectiveRackDisplayName,
  getLevelConfig,
  getTotalLocations,
  isBinActive,
  rackEntityKey,
  syncRackBinsDisplayFields,
  volumePerBin,
  volumePerBinFromTotal,
} from "./warehouseUtils";
import {
  buildRemovalImpact,
  countPassageVoidLevels,
  getPassageVoidHeightCm,
  planBinRebuild,
  rackBinPositionsDiffer,
  type StockDetailByUuid,
} from "./passageStorage";
import {
  prepareLayoutBinsForSave,
  type LayoutBinRebuildResult,
  type StructureRebuildSource,
} from "./prepareLayoutBinsForSave";
import { normalizeStorageType } from "../../utils/storageTypes";

export type { StructureRebuildSource } from "./prepareLayoutBinsForSave";

export type StructureRebuildAuditEvent = {
  source: StructureRebuildSource;
  warehouseId?: number | null;
  removedLocationUuids: string[];
  createdLocationUuids: string[];
  rackKeys: string[];
};

/** Future audit hook — intentional no-op until history tables exist. */
export function recordStructureRebuild(event: StructureRebuildAuditEvent): void {
  void event;
}

export type ActiveOperationRow = {
  location_uuid: string;
  location_label: string;
  operation_type: string;
  document_number: string;
};

export function analyzeLayoutStructureRebuild(
  layout: LayoutState,
  stockByUuid?: Map<string, number>,
  stockDetailsByUuid?: StockDetailByUuid,
  source: StructureRebuildSource = "layout_save"
): LayoutBinRebuildResult {
  return prepareLayoutBinsForSave(layout, stockByUuid, stockDetailsByUuid, source);
}

/**
 * Propose layout after template instance rematerialize (does not mutate until confirm).
 * Uses the same passages the rack will carry (LOCAL kept + INHERITED rematerialized)
 * for both bin generation and impact analysis — one void SSOT.
 */
export function analyzeTemplateInstanceRebuild(
  layout: LayoutState,
  templateId: string,
  template: CustomRackTemplate,
  stockByUuid?: Map<string, number>,
  stockDetailsByUuid?: StockDetailByUuid
): LayoutBinRebuildResult {
  const w = cmToCells(template.width_cm);
  const h = cmToCells(template.depth_cm);
  const lcEdit = getLevelConfig(template);
  const totalEdit = getTotalLocations(lcEdit);
  const volPerBin =
    totalEdit > 0
      ? volumePerBinFromTotal(template.width_cm, template.depth_cm, template.height_cm, totalEdit)
      : volumePerBin(
          template.width_cm,
          template.depth_cm,
          template.height_cm,
          template.levels,
          template.bins_per_level
        );

  const impacts: LayoutBinRebuildResult["impacts"] = [];
  let changed = false;

  const mergedRacks = layout.racks.map((r) => {
    if (r.templateId !== templateId) return r;
    const passages = rematerializeInheritedPassages(r.passages, template.default_passages);
    const freshBins = createBinsForRack(
      template.aisle_letter,
      r.rack_index,
      template.levels,
      template.bins_per_level,
      volPerBin,
      "M1",
      template.naming_pattern,
      template.width_cm,
      template.depth_cm,
      template.height_cm,
      template.bin_type_map,
      template.addressPattern,
      template.rowId,
      template.sectionStartIndex,
      template.binNamingType,
      lcEdit,
      template.namingStrategy,
      template.namingOrientation,
      template.namingPattern ?? template.addressPattern,
      template.manualLabels,
      template.overrides,
      template.indexPadding,
      template.startIndex,
      passages
    );
    const existingActive = (r.bins ?? []).filter(isBinActive);
    const structuralCount = lcEdit.length;
    const voidLevels = countPassageVoidLevels(
      template.height_cm,
      structuralCount,
      getPassageVoidHeightCm(passages)
    );
    const positionsDiffer = rackBinPositionsDiffer(existingActive, freshBins);
    const plan = planBinRebuild(r.bins ?? [], freshBins, structuralCount, voidLevels);
    if (positionsDiffer) {
      changed = true;
      const existingUuids = new Set(
        existingActive.map((b) => (b.locationUUID ?? "").trim()).filter(Boolean)
      );
      const created = plan.merged.filter((b) => {
        const u = (b.locationUUID ?? "").trim();
        return !u || !existingUuids.has(u);
      });
      impacts.push(
        buildRemovalImpact(effectiveRackDisplayName(r, layout), rackEntityKey(r), plan.removed, {
          stockByUuid,
          stockDetailsByUuid,
          beforeBins: existingActive,
          afterBins: plan.merged,
          created,
        })
      );
    }
    const mergedBins = plan.merged.map((b) => {
      const st = normalizeStorageType(b.storage_type);
      if ((template.rack_type ?? r.rack_type) === "store" && (st === "primary" || st === "unknown")) {
        return { ...b, storage_type: "pick" as const };
      }
      return b;
    });
    return {
      ...r,
      rack_type: template.rack_type ?? "warehouse",
      width: w,
      height: h,
      width_cm: template.width_cm,
      length_cm: template.depth_cm,
      height_cm: template.height_cm,
      levels: lcEdit.length,
      bins_per_level: lcEdit[0]?.locations ?? template.bins_per_level,
      levelConfig: lcEdit,
      aisle_letter: template.aisle_letter,
      color: template.color,
      bins: mergedBins,
      rackLevels: binsToLevels(mergedBins),
      total_capacity_dm3: mergedBins.reduce((s, b) => s + (Number(b.volume_dm3) || 0), 0),
      passages,
      ...(template.level_max_load_kg != null ? { level_max_load_kg: template.level_max_load_kg } : {}),
    } as RackState;
  });

  const draft: LayoutState = { ...layout, racks: mergedRacks };
  const nextRacks = mergedRacks.map((r) =>
    r.templateId === templateId ? { ...r, bins: syncRackBinsDisplayFields(r, draft) } : r
  );
  return {
    layout: { ...layout, racks: nextRacks },
    impacts,
    changed: changed || impacts.length > 0,
    source: "template_instances",
  };
}
