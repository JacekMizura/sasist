import { computeCapacityDm3, computeSlotLabel, type RackGridLevel } from "./rackLayoutUtils";
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

/** Kanoniczna komórka układu regału (OMS + WMS). */
export type RackLayoutCell = {
  key: string;
  levelClientId: string;
  segmentId?: number;
  label: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  capacityDm3: number | null;
  /** Ułamek szerokości wiersza (suma = 1 na poziomie). */
  widthFraction: number;
};

/** Kanoniczny wiersz = jeden poziom regału. */
export type RackLayoutRow = {
  key: string;
  levelClientId: string;
  levelLabel: string;
  levelHeightMm: number;
  bandHeightPx: number;
  cells: RackLayoutCell[];
};

export type OmsPreviewCell = RackLayoutCell;
export type OmsPreviewRow = RackLayoutRow;

type RackLayoutRowDraft = Omit<RackLayoutRow, "bandHeightPx">;

function normalizeCellWidthFractions(
  cells: Omit<RackLayoutCell, "widthFraction">[],
): RackLayoutCell[] {
  const widthSum = cells.reduce((s, c) => s + Math.max(0, c.widthMm), 0);
  const n = cells.length;
  return cells.map((c) => ({
    ...c,
    widthFraction:
      widthSum > 0 ? Math.max(0, c.widthMm) / widthSum : n > 0 ? 1 / n : 1,
  }));
}

function applyRackLayoutBandHeights(
  raw: RackLayoutRowDraft[],
  viewportHeightPx: number,
): RackLayoutRow[] {
  if (raw.length === 0) return [];

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

export function buildRackLayoutRowsFromDraft(
  draft: RackStructureDraft,
  viewportHeightPx: number,
): RackLayoutRow[] {
  const raw: RackLayoutRowDraft[] = draft.levels.map((lv) => {
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
        segmentId: seg.segmentId,
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
    return {
      key: lv.clientId,
      levelClientId: lv.clientId,
      levelLabel: levelName,
      levelHeightMm,
      cells: normalizeCellWidthFractions(cellsRaw),
    };
  });

  return applyRackLayoutBandHeights(raw, viewportHeightPx);
}

export function buildRackLayoutRowsFromGridLevels(
  levels: RackGridLevel[],
  viewportHeightPx: number,
): RackLayoutRow[] {
  const sorted = [...levels].sort((a, b) => a.level_index - b.level_index);
  const raw: RackLayoutRowDraft[] = sorted.map((lv, levelIndex) => {
    const levelName = (lv.name ?? "").trim() || String.fromCharCode(65 + levelIndex);
    const isSegmented = lv.is_segmented || (lv.segments?.length ?? 0) > 1;
    const segs = [...(lv.segments ?? [])].sort((a, b) => a.segment_index - b.segment_index);
    const levelHeightMm = Math.max(
      1,
      500,
      ...segs.map((s) => s.height_mm ?? 500),
    );
    const cellsRaw = segs.map((seg) => {
      const widthMm = seg.width_mm ?? 0;
      const depthMm = seg.length_mm ?? 0;
      const heightMm = seg.height_mm ?? 500;
      const customLabel = (seg.effective_slot_label ?? seg.slot_label ?? "").trim();
      const label =
        customLabel
        || computeSlotLabel(
          levelName,
          lv.level_index,
          seg.segment_index,
          isSegmented,
          seg.slot_label ?? null,
        );
      return {
        key: seg.id != null ? String(seg.id) : `${lv.level_index}-${seg.segment_index}`,
        levelClientId: String(lv.id ?? lv.level_index),
        segmentId: seg.id,
        label,
        widthMm,
        depthMm,
        heightMm,
        capacityDm3: seg.capacity_dm3 ?? computeCapacityDm3(depthMm, widthMm, heightMm),
        widthFraction: 0,
      };
    });
    return {
      key: String(lv.id ?? lv.level_index),
      levelClientId: String(lv.id ?? lv.level_index),
      levelLabel: levelName,
      levelHeightMm,
      cells: normalizeCellWidthFractions(cellsRaw),
    };
  });

  return applyRackLayoutBandHeights(raw, viewportHeightPx);
}

export function buildOmsPreviewRows(
  draft: RackStructureDraft,
  viewportHeightPx: number,
): RackLayoutRow[] {
  return buildRackLayoutRowsFromDraft(draft, viewportHeightPx);
}

export function inferRackWidthMmFromLevels(levels: RackGridLevel[]): number {
  const sorted = [...levels].sort((a, b) => a.level_index - b.level_index);
  const sums = sorted.map((lv) =>
    [...(lv.segments ?? [])].reduce((s, seg) => s + Math.max(0, seg.width_mm ?? 0), 0),
  );
  const max = Math.max(0, ...sums);
  return max > 0 ? max : 2000;
}

export function formatPreviewDimsCompact(w: number, d: number, h: number): string {
  return `${Math.round(w)}×${Math.round(d)}×${Math.round(h)}`;
}
