import { computeCapacityDm3, computeSlotLabel } from "./rackLayoutUtils";
import type { LevelDraft, RackStructureDraft, SegmentDraft } from "./rackStructureModel";

/** Wizualne tokeny zgodne z `TemplateCreator` / `RackPreview`. */
export const CONSOLIDATION_PREVIEW_CELL = {
  bg: "#eff6ff",
  border: "#bfdbfe",
  occupiedBg: "#fff7ed",
  occupiedBorder: "#fdba74",
} as const;

export const CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX = 640;

export type PreviewSegmentCell = {
  key: string;
  label: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  capacityDm3: number | null;
  segmentId?: number;
  flexGrow: number;
};

export type PreviewLevelRow = {
  key: string;
  levelLabel: string;
  levelHeightMm: number;
  segments: PreviewSegmentCell[];
};

export function buildConsolidationPreviewRows(draft: RackStructureDraft): PreviewLevelRow[] {
  return draft.levels.map((lv, levelIndex) => {
    const levelName = lv.name.trim() || String.fromCharCode(65 + levelIndex);
    const isSegmented = lv.segments.length > 1;
    const widthSum = Math.max(
      1,
      lv.segments.reduce((s, seg) => s + Math.max(1, seg.widthMm ?? 1), 0),
    );

    return {
      key: lv.clientId,
      levelLabel: `Poziom ${levelName}`,
      levelHeightMm: Math.max(
        1,
        ...lv.segments.map((s) => s.heightMm ?? lv.levelHeightMm ?? 500),
      ),
      segments: lv.segments.map((seg, segmentIndex) =>
        segmentToPreviewCell(lv, seg, levelIndex, levelName, isSegmented, widthSum),
      ),
    };
  });
}

function segmentToPreviewCell(
  lv: LevelDraft,
  seg: SegmentDraft,
  levelIndex: number,
  levelName: string,
  isSegmented: boolean,
  widthSum: number,
): PreviewSegmentCell {
  const widthMm = seg.widthMm ?? 1;
  const depthMm = seg.depthMm ?? 0;
  const heightMm = seg.heightMm ?? lv.levelHeightMm ?? 0;
  const label = computeSlotLabel(levelName, levelIndex, seg.segmentIndex, isSegmented, seg.slotLabel || null);
  return {
    key: seg.clientId,
    label,
    widthMm,
    depthMm,
    heightMm,
    capacityDm3: computeCapacityDm3(seg.depthMm, seg.widthMm, heightMm),
    segmentId: seg.segmentId,
    flexGrow: widthMm / widthSum,
  };
}
