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
      const src = lv.segments[0];
      const next = [
        ...lv.segments,
        createEmptySegment(lv.segments.length, {
          widthMm: null,
          depthMm: src?.depthMm ?? draft.totalDepthMm,
          heightMm: src?.heightMm ?? lv.levelHeightMm,
        }),
      ];
      return { ...lv, segments: redistributeSegmentWidths(next, draft.totalWidthMm) };
    }),
  };
}

function redistributeSegmentWidths(
  segments: SegmentDraft[],
  totalWidthMm: number | null,
): SegmentDraft[] {
  const n = segments.length;
  if (n === 0) return segments;
  const totalW = totalWidthMm ?? 2000;
  const baseWidth = Math.floor(totalW / n);
  const lastWidth = totalW - baseWidth * (n - 1);
  return segments.map((s, i) => ({
    ...s,
    segmentIndex: i,
    widthMm: i === n - 1 ? lastWidth : baseWidth,
  }));
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
      const filtered = lv.segments.filter((s) => s.clientId !== segmentClientId);
      const next =
        filtered.length > 0
          ? filtered
          : [
              createEmptySegment(0, {
                widthMm: draft.totalWidthMm,
                depthMm: draft.totalDepthMm,
                heightMm: lv.levelHeightMm,
              }),
            ];
      return {
        ...lv,
        segments: redistributeSegmentWidths(next, draft.totalWidthMm),
      };
    }),
  };
}

/** Kopiuje poziom (wysokość, segmenty, wymiary, nazwy) — wstawia tuż pod źródłem. */
export function duplicateLevel(
  draft: RackStructureDraft,
  levelClientId: string,
  options?: { resetNames?: boolean },
): RackStructureDraft {
  const srcIdx = draft.levels.findIndex((l) => l.clientId === levelClientId);
  if (srcIdx < 0) return draft;
  const src = draft.levels[srcIdx]!;
  const duplicated: LevelDraft = {
    clientId: newClientId("lv"),
    levelIndex: srcIdx + 1,
    name: columnLetter(draft.levels.length),
    levelHeightMm: src.levelHeightMm,
    segments: src.segments.map((seg, si) => ({
      clientId: newClientId("seg"),
      segmentIndex: si,
      slotLabel: options?.resetNames ? "" : seg.slotLabel,
      depthMm: seg.depthMm,
      widthMm: seg.widthMm,
      heightMm: seg.heightMm,
    })),
  };
  const levels = [...draft.levels];
  levels.splice(srcIdx + 1, 0, duplicated);
  return { ...draft, levels: reindexLevels(levels) };
}

/** Ustaw liczbę segmentów na poziomie — równy podział szerokości regału (jak „lokacje na poziom” w szablonie). */
export function setLevelSegmentCount(
  draft: RackStructureDraft,
  levelClientId: string,
  count: number,
): RackStructureDraft {
  const n = Math.max(1, Math.min(50, Math.round(count) || 1));
  const totalW = draft.totalWidthMm ?? 2000;
  const baseWidth = Math.floor(totalW / n);
  const lastWidth = totalW - baseWidth * (n - 1);

  return {
    ...draft,
    levels: draft.levels.map((lv) => {
      if (lv.clientId !== levelClientId) return lv;
      const existing = lv.segments;
      const segments: SegmentDraft[] = Array.from({ length: n }, (_, i) => {
        const widthMm = i === n - 1 ? lastWidth : baseWidth;
        if (i < existing.length) {
          return {
            ...existing[i]!,
            segmentIndex: i,
            widthMm,
          };
        }
        return createEmptySegment(i, {
          widthMm,
          depthMm: draft.totalDepthMm,
          heightMm: lv.levelHeightMm,
        });
      });
      return { ...lv, segments };
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

export type SegmentSelection = {
  levelClientId: string;
  segmentClientId: string;
} | null;

export function findSegmentInDraft(
  draft: RackStructureDraft,
  levelClientId: string,
  segmentClientId: string,
): { level: LevelDraft; segment: SegmentDraft } | null {
  const level = draft.levels.find((l) => l.clientId === levelClientId);
  if (!level) return null;
  const segment = level.segments.find((s) => s.clientId === segmentClientId);
  if (!segment) return null;
  return { level, segment };
}

export function segmentDisplayLabel(level: LevelDraft, segment: SegmentDraft): string {
  const levelName = level.name.trim() || columnLetter(level.levelIndex);
  const isSegmented = level.segments.length > 1;
  return computeSlotLabel(
    levelName,
    level.levelIndex,
    segment.segmentIndex,
    isSegmented,
    segment.slotLabel || null,
  );
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

/** Tolerancja zaokrągleń mm przy walidacji sumy szerokości segmentów. */
export const RACK_WIDTH_TOLERANCE_MM = 1;

export type LevelWidthValidation = {
  levelIndex: number;
  levelName: string;
  usedMm: number;
  targetMm: number;
};

export type RackDraftValidation = {
  valid: boolean;
  levelErrors: LevelWidthValidation[];
  globalError?: string;
};

export function validateRackDraft(draft: RackStructureDraft): RackDraftValidation {
  const target = draft.totalWidthMm;
  if (target == null || target <= 0) {
    return {
      valid: false,
      levelErrors: [],
      globalError: "Podaj prawidłową szerokość regału (mm).",
    };
  }

  const levelErrors: LevelWidthValidation[] = [];
  for (const lv of draft.levels) {
    const used = levelSegmentsWidthSum(lv);
    if (Math.abs(used - target) > RACK_WIDTH_TOLERANCE_MM) {
      levelErrors.push({
        levelIndex: lv.levelIndex,
        levelName: lv.name.trim() || columnLetter(lv.levelIndex),
        usedMm: used,
        targetMm: target,
      });
    }
  }

  return { valid: levelErrors.length === 0, levelErrors };
}

export function levelWidthUsage(lv: LevelDraft, targetMm: number | null): { usedMm: number; targetMm: number; valid: boolean } {
  const usedMm = levelSegmentsWidthSum(lv);
  const target = targetMm ?? 0;
  return {
    usedMm,
    targetMm: target,
    valid: target > 0 && Math.abs(usedMm - target) <= RACK_WIDTH_TOLERANCE_MM,
  };
}

export type RackPresetId = "4x4" | "3x6" | "2x8" | "empty";

export const RACK_PRESET_LABELS: Record<RackPresetId, string> = {
  "4x4": "4×4",
  "3x6": "3×6",
  "2x8": "2×8",
  empty: "Pusty regał",
};

function buildPresetLevels(
  levelCount: number,
  segCount: number,
  totalWidthMm: number,
  totalDepthMm: number,
  levelHeightMm: number,
): LevelDraft[] {
  const baseWidth = Math.floor(totalWidthMm / segCount);
  const lastWidth = totalWidthMm - baseWidth * (segCount - 1);
  return Array.from({ length: levelCount }, (_, li) => ({
    clientId: newClientId("lv"),
    levelIndex: li,
    name: columnLetter(li),
    levelHeightMm,
    segments: Array.from({ length: segCount }, (_, si) =>
      createEmptySegment(si, {
        widthMm: si === segCount - 1 ? lastWidth : baseWidth,
        depthMm: totalDepthMm,
        heightMm: levelHeightMm,
      }),
    ),
  }));
}

/** Szybkie presety układu poziomów × segmentów (tylko tworzenie). */
export function applyRackPreset(preset: RackPresetId, warehouseId = 1): RackStructureDraft {
  if (preset === "empty") {
    return createDefaultRackDraft(warehouseId);
  }

  const configs: Record<Exclude<RackPresetId, "empty">, [number, number]> = {
    "4x4": [4, 4],
    "3x6": [3, 6],
    "2x8": [2, 8],
  };
  const [levelCount, segCount] = configs[preset];
  const totalWidthMm = 2000;
  const totalDepthMm = 800;
  const levelHeightMm = 500;

  return {
    rackName: "RK-01",
    warehouseId,
    totalWidthMm,
    totalDepthMm,
    levels: buildPresetLevels(levelCount, segCount, totalWidthMm, totalDepthMm, levelHeightMm),
  };
}

/** Mapa zajętości segmentów z poziomów siatki (edycja / podgląd istniejącego regału). */
export function buildSegmentOccupancyMap(
  levels: RackGridLevel[],
): Map<
  number,
  {
    isOccupied: boolean;
    orderNumber?: string | null;
    utilizationPercent?: number | null;
    orderVolumeDm3?: number | null;
    capacityDm3?: number | null;
  }
> {
  const map = new Map<
    number,
    {
      isOccupied: boolean;
      orderNumber?: string | null;
      utilizationPercent?: number | null;
      orderVolumeDm3?: number | null;
      capacityDm3?: number | null;
    }
  >();
  for (const lv of levels) {
    for (const seg of lv.segments ?? []) {
      if (seg.id == null) continue;
      map.set(seg.id, {
        isOccupied: seg.order_id != null,
        orderNumber: seg.order_number,
        utilizationPercent: seg.utilization_percent,
        orderVolumeDm3: seg.order_volume_dm3,
        capacityDm3: seg.capacity_dm3,
      });
    }
  }
  return map;
}

function updateLevelSegments(
  draft: RackStructureDraft,
  levelClientId: string,
  mapper: (seg: SegmentDraft, index: number) => SegmentDraft,
): RackStructureDraft {
  return {
    ...draft,
    levels: draft.levels.map((lv) => {
      if (lv.clientId !== levelClientId) return lv;
      return { ...lv, segments: lv.segments.map(mapper) };
    }),
  };
}

/** Kopiuje SZ/GŁ/WYS z pierwszego segmentu poziomu na pozostałe. */
export function copyFirstSegmentDimensionsToLevel(
  draft: RackStructureDraft,
  levelClientId: string,
): RackStructureDraft {
  const lv = draft.levels.find((l) => l.clientId === levelClientId);
  const src = lv?.segments[0];
  if (!src) return draft;
  const w = src.widthMm;
  const d = src.depthMm;
  const h = src.heightMm ?? lv?.levelHeightMm;
  return updateLevelSegments(draft, levelClientId, (seg, i) =>
    i === 0 ? seg : { ...seg, widthMm: w, depthMm: d, heightMm: h },
  );
}

/** Kopiuje głębokość (pierwszy segment lub parametr) na wszystkie segmenty poziomu. */
export function copyDepthToAllSegmentsInLevel(
  draft: RackStructureDraft,
  levelClientId: string,
  depthMm?: number | null,
): RackStructureDraft {
  const lv = draft.levels.find((l) => l.clientId === levelClientId);
  const depth = depthMm ?? lv?.segments[0]?.depthMm ?? draft.totalDepthMm;
  return updateLevelSegments(draft, levelClientId, (seg) => ({ ...seg, depthMm: depth }));
}

/** Kopiuje wysokość (pierwszy segment / wys. poziomu) na wszystkie segmenty poziomu. */
export function copyHeightToAllSegmentsInLevel(
  draft: RackStructureDraft,
  levelClientId: string,
  heightMm?: number | null,
): RackStructureDraft {
  const lv = draft.levels.find((l) => l.clientId === levelClientId);
  const height = heightMm ?? lv?.segments[0]?.heightMm ?? lv?.levelHeightMm;
  return updateLevelSegments(draft, levelClientId, (seg) => ({ ...seg, heightMm: height }));
}

/** Prefiks + numeracja: TV → TV-01, TV-02, … */
export function applySegmentNameNumbering(
  draft: RackStructureDraft,
  levelClientId: string,
  prefix: string,
): RackStructureDraft {
  const trimmed = prefix.trim();
  if (!trimmed) return draft;
  const lv = draft.levels.find((l) => l.clientId === levelClientId);
  const count = lv?.segments.length ?? 0;
  const pad = count >= 100 ? 3 : count >= 10 ? 2 : 2;
  return updateLevelSegments(draft, levelClientId, (seg, i) => ({
    ...seg,
    slotLabel: `${trimmed}-${String(i + 1).padStart(pad, "0")}`,
  }));
}
