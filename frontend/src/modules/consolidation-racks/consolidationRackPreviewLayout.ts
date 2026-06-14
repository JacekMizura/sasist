import { computeCapacityDm3, computeSlotLabel } from "./rackLayoutUtils";
import type { LevelDraft, RackStructureDraft, SegmentDraft } from "./rackStructureModel";

/** Wizualne tokeny zgodne z `TemplateCreator` / `RackPreview`. */
export const CONSOLIDATION_PREVIEW_CELL = {
  bg: "#eff6ff",
  border: "#bfdbfe",
  freeBg: "#ecfdf5",
  freeBorder: "#6ee7b7",
  occupiedBg: "#fff7ed",
  occupiedBorder: "#fdba74",
} as const;

export const CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX = 700;
export const CONSOLIDATION_PREVIEW_MIN_LEVEL_BAND_PX = 56;

export const CONSOLIDATION_PREVIEW_SELECT = {
  levelRing: "ring-2 ring-orange-400/70 ring-offset-1",
  segmentBorder: "#ea580c",
  segmentBorderWidth: 3,
} as const;

export type PreviewDisplayMode = "layout" | "dimensions" | "capacity";

export type SegmentOccupancyInfo = {
  isOccupied: boolean;
  orderNumber?: string | null;
  utilizationPercent?: number | null;
  orderVolumeDm3?: number | null;
  capacityDm3?: number | null;
};

export type PreviewSegmentCell = {
  key: string;
  label: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  capacityDm3: number | null;
  segmentId?: number;
  /** Ułamek szerokości regału (width_mm / totalWidthMm) */
  widthFraction: number;
};

export type PreviewLevelRow = {
  key: string;
  levelLabel: string;
  levelHeightMm: number;
  /** Wysokość pasa w px — proporcjonalna do levelHeightMm */
  bandHeightPx: number;
  segments: PreviewSegmentCell[];
};

export function buildConsolidationPreviewRows(draft: RackStructureDraft): PreviewLevelRow[] {
  const rackWidth = Math.max(1, draft.totalWidthMm ?? 2000);
  const levels = draft.levels;
  const rawRows = levels.map((lv, levelIndex) => {
    const levelName = lv.name.trim() || String.fromCharCode(65 + levelIndex);
    const isSegmented = lv.segments.length > 1;
    const levelHeightMm = Math.max(
      1,
      lv.levelHeightMm ?? 500,
      ...lv.segments.map((s) => s.heightMm ?? lv.levelHeightMm ?? 500),
    );

    return {
      key: lv.clientId,
      levelLabel: `Poziom ${levelName}`,
      levelHeightMm,
      segments: lv.segments.map((seg) =>
        segmentToPreviewCell(lv, seg, levelIndex, levelName, isSegmented, rackWidth),
      ),
    };
  });

  const totalHeightMm = rawRows.reduce((s, r) => s + r.levelHeightMm, 0);
  const innerPx = CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX - 24;
  const levelCount = rawRows.length;
  const minBandPx =
    levelCount >= 10 ? 28 : levelCount >= 6 ? 36 : CONSOLIDATION_PREVIEW_MIN_LEVEL_BAND_PX;
  let bands = rawRows.map((row) => ({
    ...row,
    bandHeightPx: Math.max(
      minBandPx,
      (row.levelHeightMm / totalHeightMm) * innerPx,
    ),
  }));

  const bandSum = bands.reduce((s, r) => s + r.bandHeightPx, 0);
  if (bandSum > innerPx && bandSum > 0) {
    const scale = innerPx / bandSum;
    bands = bands.map((row) => ({
      ...row,
      bandHeightPx: Math.max(minBandPx - 8, Math.round(row.bandHeightPx * scale)),
    }));
  }

  return bands;
}

function segmentToPreviewCell(
  lv: LevelDraft,
  seg: SegmentDraft,
  levelIndex: number,
  levelName: string,
  isSegmented: boolean,
  rackWidthMm: number,
): PreviewSegmentCell {
  const widthMm = seg.widthMm ?? 0;
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
    widthFraction: widthMm / rackWidthMm,
  };
}

/** Tekst wymiarów w komórce podglądu (jak Twórca szablonu). */
export function formatPreviewDimsLine(w: number, d: number, h: number, compact: boolean): string {
  const rw = Math.round(w);
  const rd = Math.round(d);
  const rh = Math.round(h);
  if (compact) return `${rw}×${rd}×${rh}`;
  return `SZ ${rw} · GŁ ${rd} · WYS ${rh}`;
}

export function formatPreviewDimsMultiline(w: number, d: number, h: number): [string, string, string] {
  return [`SZ ${Math.round(w)}`, `GŁ ${Math.round(d)}`, `WYS ${Math.round(h)}`];
}

export type OmsPreviewCell = {
  key: string;
  levelClientId: string;
  label: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  capacityDm3: number | null;
  /** Ułamek szerokości wiersza (suma = 1 na poziomie). */
  widthFraction: number;
};

export type OmsPreviewRow = {
  key: string;
  levelClientId: string;
  levelLabel: string;
  levelHeightMm: number;
  bandHeightPx: number;
  cells: OmsPreviewCell[];
};

export function buildOmsPreviewRows(
  draft: import("./rackStructureModel").RackStructureDraft,
  viewportHeightPx: number,
): OmsPreviewRow[] {
  const raw = draft.levels.map((lv) => {
    const levelName = lv.name.trim() || String.fromCharCode(65 + lv.levelIndex);
    const isSegmented = lv.segments.length > 1;
    const levelHeightMm = Math.max(
      1,
      lv.levelHeightMm ?? 500,
      ...lv.segments.map((s) => s.heightMm ?? lv.levelHeightMm ?? 500),
    );
    const cellsRaw = lv.segments.map((seg) => {
      const widthMm = seg.widthMm ?? 0;
      const depthMm = seg.depthMm ?? 0;
      const heightMm = seg.heightMm ?? lv.levelHeightMm ?? 0;
      return {
        key: seg.clientId,
        levelClientId: lv.clientId,
        label: computeSlotLabel(
          levelName,
          lv.levelIndex,
          seg.segmentIndex,
          isSegmented,
          seg.slotLabel || null,
        ),
        widthMm,
        depthMm,
        heightMm,
        capacityDm3: computeCapacityDm3(seg.depthMm, seg.widthMm, heightMm),
        widthFraction: 0,
      };
    });
    const widthSum = cellsRaw.reduce((s, c) => s + Math.max(0, c.widthMm), 0);
    const n = cellsRaw.length;
    const cells = cellsRaw.map((c) => ({
      ...c,
      widthFraction:
        widthSum > 0
          ? Math.max(0, c.widthMm) / widthSum
          : n > 0
            ? 1 / n
            : 1,
    }));
    return {
      key: lv.clientId,
      levelClientId: lv.clientId,
      levelLabel: levelName,
      levelHeightMm,
      cells,
    };
  });

  const levelCount = raw.length;
  const minBand =
    levelCount >= 10 ? 32 : levelCount >= 6 ? 44 : levelCount >= 4 ? 56 : 72;
  const totalHeightMm = raw.reduce((s, r) => s + r.levelHeightMm, 0);
  const innerPx = Math.max(200, viewportHeightPx - 16);
  const proportionalSum = raw.reduce(
    (s, row) => s + Math.max(minBand, (row.levelHeightMm / totalHeightMm) * innerPx),
    0,
  );

  if (proportionalSum <= innerPx) {
    return raw.map((row) => ({
      ...row,
      bandHeightPx: Math.max(minBand, (row.levelHeightMm / totalHeightMm) * innerPx),
    }));
  }

  return raw.map((row) => ({ ...row, bandHeightPx: minBand }));
}

export function formatPreviewDimsCompact(w: number, d: number, h: number): string {
  return `${Math.round(w)}×${Math.round(d)}×${Math.round(h)}`;
}
