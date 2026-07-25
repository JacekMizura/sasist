/**
 * Prepare racks for layout save: regenerate bins from structure + passages,
 * merge identity, collect removal impacts for confirmation UI.
 *
 * Single FE analysis path for structure rebuild (layout save + template instances).
 * Does NOT trim internal_structure — construction heights stay intact for Z.
 */

import type { LayoutState, RackState } from "../../types/warehouse";
import {
  binsToLevels,
  createBinsForRackState,
  effectiveRackDisplayName,
  getLevelConfig,
  isBinActive,
  rackEntityKey,
} from "./warehouseUtils";
import {
  buildRemovalImpact,
  countPassageVoidLevelsForRack,
  planBinRebuild,
  rackBinPositionsDiffer,
  type StockDetailByUuid,
  type StructureRemovalImpact,
} from "./passageStorage";

export type StructureRebuildSource = "layout_save" | "template_instances" | "api";

export type LayoutBinRebuildResult = {
  layout: LayoutState;
  impacts: StructureRemovalImpact[];
  changed: boolean;
  source: StructureRebuildSource;
};

export function prepareLayoutBinsForSave(
  layout: LayoutState,
  stockByUuid?: Map<string, number>,
  stockDetailsByUuid?: StockDetailByUuid,
  source: StructureRebuildSource = "layout_save"
): LayoutBinRebuildResult {
  const impacts: StructureRemovalImpact[] = [];
  let changed = false;
  const racks = layout.racks.map((rack) => {
    const nextBins = createBinsForRackState(rack);
    const existingActive = (rack.bins ?? []).filter(isBinActive);
    if (!rackBinPositionsDiffer(existingActive, nextBins)) {
      return rack;
    }
    const structuralCount = getLevelConfig(rack).length;
    const voidLevels = countPassageVoidLevelsForRack(rack);
    const plan = planBinRebuild(rack.bins ?? [], nextBins, structuralCount, voidLevels);
    changed = true;
    const existingUuids = new Set(
      existingActive.map((b) => (b.locationUUID ?? "").trim()).filter(Boolean)
    );
    const created = plan.merged.filter((b) => {
      const u = (b.locationUUID ?? "").trim();
      return !u || !existingUuids.has(u);
    });
    impacts.push(
      buildRemovalImpact(effectiveRackDisplayName(rack, layout), rackEntityKey(rack), plan.removed, {
        stockByUuid,
        stockDetailsByUuid,
        beforeBins: existingActive,
        afterBins: plan.merged,
        created,
      })
    );
    // Keep full construction internal_structure (no trim) so Z stays physically correct.
    return {
      ...rack,
      bins: plan.merged,
      rackLevels: binsToLevels(plan.merged),
      total_capacity_dm3: plan.merged.reduce((s, b) => s + (Number(b.volume_dm3) || 0), 0),
    } as RackState;
  });
  return {
    layout: { ...layout, racks },
    impacts,
    changed,
    source,
  };
}
