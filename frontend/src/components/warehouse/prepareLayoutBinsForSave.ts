/**
 * Prepare racks for layout save: regenerate bins from structure + passages,
 * merge identity, collect removal impacts for confirmation UI.
 */

import type { LayoutState, RackState } from "../../types/warehouse";
import {
  binsToLevels,
  createBinsForRackState,
  effectiveRackDisplayName,
  getLevelConfig,
  rackEntityKey,
} from "./warehouseUtils";
import {
  buildRemovalImpact,
  countPassageVoidLevelsForRack,
  planBinRebuild,
  rackBinPositionsDiffer,
  type StructureRemovalImpact,
} from "./passageStorage";

export type LayoutBinRebuildResult = {
  layout: LayoutState;
  impacts: StructureRemovalImpact[];
  changed: boolean;
};

export function prepareLayoutBinsForSave(
  layout: LayoutState,
  stockByUuid?: Map<string, number>
): LayoutBinRebuildResult {
  const impacts: StructureRemovalImpact[] = [];
  let changed = false;
  const racks = layout.racks.map((rack) => {
    const nextBins = createBinsForRackState(rack);
    if (!rackBinPositionsDiffer(rack.bins ?? [], nextBins)) {
      return rack;
    }
    const structuralCount = getLevelConfig(rack).length;
    const voidLevels = countPassageVoidLevelsForRack(rack);
    const plan = planBinRebuild(rack.bins ?? [], nextBins, structuralCount, voidLevels);
    changed = true;
    if (plan.removed.length > 0) {
      impacts.push(
        buildRemovalImpact(
          effectiveRackDisplayName(rack, layout),
          rackEntityKey(rack),
          plan.removed,
          stockByUuid
        )
      );
    }
    return {
      ...rack,
      bins: plan.merged,
      rackLevels: binsToLevels(plan.merged),
      total_capacity_dm3: plan.merged.reduce((s, b) => s + (Number(b.volume_dm3) || 0), 0),
      ...(trimInternalStructureForVoid(rack, voidLevels)
        ? { internal_structure: trimInternalStructureForVoid(rack, voidLevels) }
        : {}),
    } as RackState;
  });
  return {
    layout: { ...layout, racks },
    impacts,
    changed,
  };
}

function trimInternalStructureForVoid(
  rack: RackState,
  voidLevels: number
): RackState["internal_structure"] | null {
  if (voidLevels <= 0) return null;
  const levels = rack.internal_structure?.levels;
  if (!levels?.length) return null;
  const structural = getLevelConfig(rack).length;
  if (levels.length !== structural) return null;
  if (levels.length <= voidLevels) return { levels: [] };
  return { levels: levels.slice(voidLevels) };
}
