/**
 * P5.12 — model konfiguratora OMS (poziomy × segmenty), mapowany na ConsolidationRackLevel + RackSegment.
 */

import type { ConsolidationRack } from "./consolidationRackTypes";
import {
  columnLetter,
  computeCapacityDm3,
  computeSlotLabel,
  type RackGridLevel,
  type RackLevelPayload,
} from "./rackLayoutUtils";

export type SegmentDraft = {
  clientId: string;
  segmentId?: number;
  segmentIndex: number;
  slotLabel: string;
  /** Głębokość segmentu (mm) → length_mm w DB */
  depthMm: number | null;
  /** Szerokość segmentu (mm) → width_mm w DB */
  widthMm: number | null;
  /** Wysokość segmentu (mm) → height_mm w DB */
  heightMm: number | null;
};

export type LevelDraft = {
  clientId: string;
  levelId?: number;
  levelIndex: number;
  name: string;
  /** Domyślna wysokość nowych segmentów w poziomie (mm) */
  levelHeightMm: number | null;
  segments: SegmentDraft[];
};

export type RackStructureDraft = {
  rackName: string;
  warehouseId: number;
  /** Szerokość całego regału (mm) — podgląd + domyślna szerokość segmentu */
  totalWidthMm: number | null;
  /** Głębokość regału (mm) — domyślna głębokość segmentu */
  totalDepthMm: number | null;
  levels: LevelDraft[];
};

let _uid = 0;
export function newClientId(prefix: string): string {
  _uid += 1;
  return `${prefix}-${_uid}-${Date.now()}`;
}

export function createEmptySegment(
  index: number,
  defaults: { widthMm?: number | null; depthMm?: number | null; heightMm?: number | null },
): SegmentDraft {
  return {
    clientId: newClientId("seg"),
    segmentIndex: index,
    slotLabel: "",
    widthMm: defaults.widthMm ?? null,
    depthMm: defaults.depthMm ?? null,
    heightMm: defaults.heightMm ?? null,
  };
}

export function createEmptyLevel(
  index: number,
  defaults: { widthMm?: number | null; depthMm?: number | null; heightMm?: number | null },
): LevelDraft {
  return {
    clientId: newClientId("lv"),
    levelIndex: index,
    name: columnLetter(index),
    levelHeightMm: defaults.heightMm ?? 500,
    segments: [createEmptySegment(0, defaults)],
  };
}

export function createDefaultRackDraft(warehouseId = 1): RackStructureDraft {
  return {
    rackName: "RK-01",
    warehouseId,
    totalWidthMm: 2000,
    totalDepthMm: 800,
    levels: [createEmptyLevel(0, { widthMm: 2000, depthMm: 800, heightMm: 500 })],
  };
}

function reindexLevels(levels: LevelDraft[]): LevelDraft[] {
  return levels.map((lv, li) => ({
    ...lv,
    levelIndex: li,
    segments: lv.segments.map((s, si) => ({ ...s, segmentIndex: si })),
  }));
}

export function addLevel(draft: RackStructureDraft): RackStructureDraft {
  const idx = draft.levels.length;
  const segWidth = draft.totalWidthMm != null ? Math.round(draft.totalWidthMm / 2) : 1000;
  return {
    ...draft,
    levels: reindexLevels([
      ...draft.levels,
      createEmptyLevel(idx, {
        widthMm: segWidth,
        depthMm: draft.totalDepthMm,
        heightMm: 500,
      }),
    ]),
  };
}

export function removeLevel(draft: RackStructureDraft, levelClientId: string): RackStructureDraft {
  if (draft.levels.length <= 1) return draft;
  return {
    ...draft,
    levels: reindexLevels(draft.levels.filter((l) => l.clientId !== levelClientId)),
  };
}

export function addSegment(draft: RackStructureDraft, levelClientId: string): RackStructureDraft {
  return {
    ...draft,
    levels: draft.levels.map((lv) => {
      if (lv.clientId !== levelClientId) return lv;
      const idx = lv.segments.length;
      const used = lv.segments.reduce((s, seg) => s + (seg.widthMm ?? 0), 0);
      const remaining =
        draft.totalWidthMm != null ? Math.max(100, draft.totalWidthMm - used) : 500;
      return {
        ...lv,
        segments: [
          ...lv.segments,
          createEmptySegment(idx, {
            widthMm: remaining,
            depthMm: draft.totalDepthMm,
            heightMm: lv.levelHeightMm,
          }),
        ],
      };
    }),
  };
}

export function removeSegment(
  draft: RackStructureDraft,
  levelClientId: string,
  segmentClientId: string,
): RackStructureDraft {
  return {
    ...draft,
    levels: draft.levels.map((lv) => {
      if (lv.clientId !== levelClientId) return lv;
      const next = lv.segments.filter((s) => s.clientId !== segmentClientId);
      return {
        ...lv,
        segments:
          next.length > 0
            ? next
            : [
                createEmptySegment(0, {
                  widthMm: draft.totalWidthMm,
                  depthMm: draft.totalDepthMm,
                  heightMm: lv.levelHeightMm,
                }),
              ],
      };
    }),
  };
}

/** UI draft → POST /racks/ payload */
export function draftToApiPayload(draft: RackStructureDraft): RackLevelPayload[] {
  return draft.levels.map((lv, levelIndex) => {
    const levelName = lv.name.trim() || columnLetter(levelIndex);
    const isSegmented = lv.segments.length > 1;
    return {
      level_index: levelIndex,
      name: levelName,
      is_segmented: isSegmented,
      segments: lv.segments.map((seg, segmentIndex) => {
        const height = seg.heightMm ?? lv.levelHeightMm;
        const custom = seg.slotLabel.trim();
        const autoLabel = computeSlotLabel(levelName, levelIndex, segmentIndex, isSegmented, null);
        return {
          segment_index: segmentIndex,
          order_id: null,
          fill_percent: 0,
          slot_label: custom && custom !== autoLabel ? custom : null,
          length_mm: seg.depthMm,
          width_mm: seg.widthMm,
          height_mm: height,
        };
      }),
    };
  });
}

/** GET /racks/{id} → UI draft */
export function apiRackToDraft(rack: ConsolidationRack): RackStructureDraft {
  const sorted = [...(rack.levels ?? [])].sort((a, b) => a.level_index - b.level_index);
  let maxLevelWidth = 0;
  const levels: LevelDraft[] = sorted.map((lv) => {
    const segs = [...(lv.segments ?? [])].sort((a, b) => a.segment_index - b.segment_index);
    const levelWidth = segs.reduce((s, seg) => s + (seg.width_mm ?? 0), 0);
    maxLevelWidth = Math.max(maxLevelWidth, levelWidth);
    const heights = segs.map((s) => s.height_mm).filter((h): h is number => h != null && h > 0);
    const levelHeight = heights.length ? heights[0]! : null;
    return {
      clientId: newClientId("lv"),
      levelId: lv.id,
      levelIndex: lv.level_index,
      name: (lv.name ?? "").trim() || columnLetter(lv.level_index),
      levelHeightMm: levelHeight,
      segments: segs.map((seg) => ({
        clientId: newClientId("seg"),
        segmentId: seg.id,
        segmentIndex: seg.segment_index,
        slotLabel: (seg.slot_label ?? "").trim(),
        depthMm: seg.length_mm ?? null,
        widthMm: seg.width_mm ?? null,
        heightMm: seg.height_mm ?? null,
      })),
    };
  });

  const depths = sorted
    .flatMap((lv) => (lv.segments ?? []).map((s) => s.length_mm))
    .filter((d): d is number => d != null && d > 0);
  return {
    rackName: rack.name,
    warehouseId: rack.warehouse_id ?? 1,
    totalWidthMm: maxLevelWidth > 0 ? maxLevelWidth : 2000,
    totalDepthMm: depths[0] ?? 800,
    levels: levels.length ? levels : [createEmptyLevel(0, {})],
  };
}

/** Draft → RackGridLevel[] dla statystyk / occupancy */
export function draftToGridLevels(
  draft: RackStructureDraft,
  sourceRack?: ConsolidationRack | null,
): RackGridLevel[] {
  const segById = new Map<number, RackGridLevel["segments"][number]>();
  if (sourceRack) {
    for (const lv of sourceRack.levels ?? []) {
      for (const seg of lv.segments ?? []) {
        if (seg.id != null) segById.set(seg.id, seg);
      }
    }
  }

  return draft.levels.map((lv, levelIndex) => {
    const levelName = lv.name.trim() || columnLetter(levelIndex);
    const isSegmented = lv.segments.length > 1;
    return {
      id: lv.levelId,
      level_index: levelIndex,
      name: levelName,
      is_segmented: isSegmented,
      segments: lv.segments.map((seg, segmentIndex) => {
        const api = seg.segmentId != null ? segById.get(seg.segmentId) : undefined;
        const height = seg.heightMm ?? lv.levelHeightMm;
        const l = seg.depthMm;
        const w = seg.widthMm;
        const h = height;
        return {
          id: seg.segmentId,
          segment_index: segmentIndex,
          order_id: api?.order_id ?? null,
          order_number: api?.order_number ?? null,
          fill_percent: api?.fill_percent,
          slot_label: seg.slotLabel.trim() || null,
          effective_slot_label: computeSlotLabel(
            levelName,
            levelIndex,
            segmentIndex,
            isSegmented,
            seg.slotLabel || null,
          ),
          length_mm: l,
          width_mm: w,
          height_mm: h,
          capacity_dm3: api?.capacity_dm3 ?? computeCapacityDm3(l, w, h),
          order_volume_dm3: api?.order_volume_dm3,
          utilization_percent: api?.utilization_percent,
          capacity_overflow: api?.capacity_overflow,
        };
      }),
    };
  });
}

export function segmentEffectiveLabel(rackName: string, lv: LevelDraft, seg: SegmentDraft): string {
  const levelName = lv.name.trim() || columnLetter(lv.levelIndex);
  const isSegmented = lv.segments.length > 1;
  const slot = computeSlotLabel(levelName, lv.levelIndex, seg.segmentIndex, isSegmented, seg.slotLabel || null);
  return `${rackName}/${slot}`;
}

export function levelSegmentsWidthSum(lv: LevelDraft): number {
  return lv.segments.reduce((s, seg) => s + (seg.widthMm ?? 0), 0);
}

export function countSegments(draft: RackStructureDraft): number {
  return draft.levels.reduce((s, lv) => s + lv.segments.length, 0);
}

export function segmentDraftPayload(seg: SegmentDraft, lv: LevelDraft) {
  const levelName = lv.name.trim() || columnLetter(lv.levelIndex);
  const isSegmented = lv.segments.length > 1;
  const custom = seg.slotLabel.trim();
  const autoLabel = computeSlotLabel(levelName, lv.levelIndex, seg.segmentIndex, isSegmented, null);
  const height = seg.heightMm ?? lv.levelHeightMm;
  return {
    slot_label: custom && custom !== autoLabel ? custom : null,
    length_mm: seg.depthMm,
    width_mm: seg.widthMm,
    height_mm: height,
  };
}
