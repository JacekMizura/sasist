/**
 * RackPassage local geometry helpers (mirrors backend physical_collision.passage_world_rect).
 * Passages are local to the rack footprint — move/rotate of rack moves the hole.
 */

import type { LayoutState, RackPassageState, RackState } from "../../../types/warehouse";
import { GRID_UNIT_CM } from "../../../types/warehouse";

export const DEFAULT_PASSAGE_WIDTH_CM = 90;

export function newPassageUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `passage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function rackAlongIsX(rack: Pick<RackState, "orientation">): boolean {
  return (rack.orientation || "vertical").toLowerCase() === "horizontal";
}

/** Along-axis length in cm from grid footprint. */
export function rackAlongLengthCm(rack: Pick<RackState, "orientation" | "width" | "height">): number {
  return rackAlongIsX(rack) ? rack.width * GRID_UNIT_CM : rack.height * GRID_UNIT_CM;
}

export function rackUuid(rack: RackState): string {
  return rack.uuid ?? String(rack.id ?? rack.rack_index);
}

/** Rack footprint in layout cm (grid cell origin = top-left). */
export function rackFootprintCm(rack: Pick<RackState, "x" | "y" | "width" | "height">): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const minX = rack.x * GRID_UNIT_CM;
  const minY = rack.y * GRID_UNIT_CM;
  return {
    minX,
    minY,
    maxX: minX + rack.width * GRID_UNIT_CM,
    maxY: minY + rack.height * GRID_UNIT_CM,
  };
}

/** Cell top-left corner in cm. */
export function layoutCellToCm(cell: { x: number; y: number }): { x: number; y: number } {
  return { x: cell.x * GRID_UNIT_CM, y: cell.y * GRID_UNIT_CM };
}

/** Cell center in cm. */
export function layoutCellCenterCm(cell: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (cell.x + 0.5) * GRID_UNIT_CM,
    y: (cell.y + 0.5) * GRID_UNIT_CM,
  };
}

export function defaultPassageForRack(rack: RackState): RackPassageState {
  const along = rackAlongLengthCm(rack);
  const width = Math.min(100, Math.max(40, along * 0.25));
  const offset = Math.max(0, (along - width) / 2);
  return {
    uuid: newPassageUuid(),
    offset_along_cm: offset,
    width_cm: width,
    clearance_height_cm: null,
    enabled: true,
  };
}

/** Passage rect in layout px within clamped rack rect. */
export function passageRectInRackPx(
  rack: RackState,
  passage: RackPassageState,
  rect: { rectX: number; rectY: number; rectW: number; rectH: number }
): { x: number; y: number; w: number; h: number } | null {
  const alongCm = rackAlongLengthCm(rack);
  if (alongCm <= 0) return null;
  const off = Math.max(0, passage.offset_along_cm);
  const width = Math.max(1, passage.width_cm);
  const a0 = Math.min(off / alongCm, 1);
  const a1 = Math.min((off + width) / alongCm, 1);
  if (a1 <= a0) return null;
  if (rackAlongIsX(rack)) {
    return {
      x: rect.rectX + rect.rectW * a0,
      y: rect.rectY,
      w: rect.rectW * (a1 - a0),
      h: rect.rectH,
    };
  }
  return {
    x: rect.rectX,
    y: rect.rectY + rect.rectH * a0,
    w: rect.rectW,
    h: rect.rectH * (a1 - a0),
  };
}

export type RackPassagePlacement = {
  rackUuid: string;
  offset_along_cm: number;
  width_cm: number;
};

export type WorldCorridorSpec = {
  axis: "x" | "y";
  /** Center on perpendicular axis (Y when axis x, X when axis y). */
  centerCm: number;
  widthCm: number;
  /** Extent along corridor axis in cm. */
  extentMinCm: number;
  extentMaxCm: number;
};

function intersectAabb(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);
  if (maxX <= minX || maxY <= minY) return null;
  return { minX, minY, maxX, maxY };
}

export function corridorSpecFromDrag(
  startCm: { x: number; y: number },
  endCm: { x: number; y: number },
  widthCm: number,
  opts?: { freeAngle?: boolean; orthoThresholdCm?: number }
): WorldCorridorSpec {
  const threshold = opts?.orthoThresholdCm ?? 35;
  const dx = Math.abs(endCm.x - startCm.x);
  const dy = Math.abs(endCm.y - startCm.y);
  let axis: "x" | "y";
  if (opts?.freeAngle) {
    axis = dx >= dy ? "x" : "y";
  } else if (dy <= threshold && dy <= dx) {
    axis = "x";
  } else if (dx <= threshold && dx < dy) {
    axis = "y";
  } else {
    axis = dx >= dy ? "x" : "y";
  }
  if (axis === "x") {
    return {
      axis: "x",
      centerCm: (startCm.y + endCm.y) / 2,
      widthCm,
      extentMinCm: Math.min(startCm.x, endCm.x),
      extentMaxCm: Math.max(startCm.x, endCm.x),
    };
  }
  return {
    axis: "y",
    centerCm: (startCm.x + endCm.x) / 2,
    widthCm,
    extentMinCm: Math.min(startCm.y, endCm.y),
    extentMaxCm: Math.max(startCm.y, endCm.y),
  };
}

export function corridorWorldAabb(spec: WorldCorridorSpec): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const half = spec.widthCm / 2;
  if (spec.axis === "x") {
    return {
      minX: spec.extentMinCm,
      maxX: spec.extentMaxCm,
      minY: spec.centerCm - half,
      maxY: spec.centerCm + half,
    };
  }
  return {
    minX: spec.centerCm - half,
    maxX: spec.centerCm + half,
    minY: spec.extentMinCm,
    maxY: spec.extentMaxCm,
  };
}

function placementFromIntersection(
  rack: RackState,
  intersection: { minX: number; minY: number; maxX: number; maxY: number }
): { offset_along_cm: number; width_cm: number } | null {
  const fp = rackFootprintCm(rack);
  if (rackAlongIsX(rack)) {
    const ix0 = Math.max(intersection.minX, fp.minX);
    const ix1 = Math.min(intersection.maxX, fp.maxX);
    if (ix1 - ix0 < 1) return null;
    return { offset_along_cm: ix0 - fp.minX, width_cm: ix1 - ix0 };
  }
  const iy0 = Math.max(intersection.minY, fp.minY);
  const iy1 = Math.min(intersection.maxY, fp.maxY);
  if (iy1 - iy0 < 1) return null;
  return { offset_along_cm: iy0 - fp.minY, width_cm: iy1 - iy0 };
}

/**
 * Map a world corridor (axis-aligned band) to per-rack local passage params.
 * axis x = horizontal band (Y center) — typical drive-through across vertical racks.
 * axis y = vertical band (X center) — across horizontal racks.
 */
export function worldCorridorToPassages(
  racks: RackState[],
  axis: "x" | "y",
  centerCm: number,
  widthCm: number,
  extentMinCm?: number,
  extentMaxCm?: number
): RackPassagePlacement[] {
  const half = widthCm / 2;
  const corridor =
    axis === "x"
      ? {
          minX: extentMinCm ?? -Infinity,
          maxX: extentMaxCm ?? Infinity,
          minY: centerCm - half,
          maxY: centerCm + half,
        }
      : {
          minX: centerCm - half,
          maxX: centerCm + half,
          minY: extentMinCm ?? -Infinity,
          maxY: extentMaxCm ?? Infinity,
        };

  const out: RackPassagePlacement[] = [];
  for (const rack of racks) {
    const fp = rackFootprintCm(rack);
    const hit = intersectAabb(corridor, fp);
    if (!hit) continue;
    const local = placementFromIntersection(rack, hit);
    if (!local) continue;
    const along = rackAlongLengthCm(rack);
    const offset = Math.max(0, Math.min(local.offset_along_cm, along));
    const width = Math.max(10, Math.min(local.width_cm, along - offset));
    out.push({
      rackUuid: rackUuid(rack),
      offset_along_cm: offset,
      width_cm: width,
    });
  }
  return out;
}

export function worldCorridorToPassagesFromSpec(
  racks: RackState[],
  spec: WorldCorridorSpec
): RackPassagePlacement[] {
  return worldCorridorToPassages(
    racks,
    spec.axis,
    spec.centerCm,
    spec.widthCm,
    spec.extentMinCm,
    spec.extentMaxCm
  );
}

function findRackByUuid(racks: RackState[], uuid: string): RackState | undefined {
  return racks.find((r) => rackUuid(r) === uuid);
}

function upsertPassageOnRack(
  rack: RackState,
  placement: RackPassagePlacement,
  existingPassageUuid?: string
): RackPassageState[] {
  const list = [...(rack.passages ?? [])];
  const idx = existingPassageUuid ? list.findIndex((p) => p.uuid === existingPassageUuid) : -1;
  const next: RackPassageState = {
    uuid: idx >= 0 ? list[idx].uuid : newPassageUuid(),
    offset_along_cm: placement.offset_along_cm,
    width_cm: placement.width_cm,
    clearance_height_cm: idx >= 0 ? list[idx].clearance_height_cm ?? null : null,
    enabled: idx >= 0 ? list[idx].enabled !== false : true,
    ...(idx >= 0 && list[idx].id != null ? { id: list[idx].id } : {}),
  };
  if (idx >= 0) {
    list[idx] = next;
    return list;
  }
  return [...list, next];
}

/** Apply corridor placements to layout (creates/updates one passage per affected rack). */
export function applyPassagePlacements(
  layout: LayoutState,
  placements: RackPassagePlacement[],
  opts?: { replacePassageUuidByRack?: Record<string, string> }
): LayoutState {
  const byRack = new Map(placements.map((p) => [p.rackUuid, p]));
  return {
    ...layout,
    racks: layout.racks.map((rack) => {
      const placement = byRack.get(rackUuid(rack));
      if (!placement) return rack;
      const replaceUuid = opts?.replacePassageUuidByRack?.[rackUuid(rack)];
      return {
        ...rack,
        passages: upsertPassageOnRack(rack, placement, replaceUuid),
      };
    }),
  };
}

export function clampPassageOffset(
  rack: RackState,
  offset_along_cm: number,
  width_cm: number
): { offset_along_cm: number; width_cm: number } {
  const along = rackAlongLengthCm(rack);
  const width = Math.max(10, Math.min(width_cm, along));
  const offset = Math.max(0, Math.min(offset_along_cm, along - width));
  return { offset_along_cm: offset, width_cm: width };
}

export function updateRackPassage(
  layout: LayoutState,
  rackUuidKey: string,
  passageUuid: string,
  patch: Partial<Pick<RackPassageState, "offset_along_cm" | "width_cm" | "enabled">>
): LayoutState {
  return {
    ...layout,
    racks: layout.racks.map((rack) => {
      if (rackUuid(rack) !== rackUuidKey) return rack;
      const passages = (rack.passages ?? []).map((p) => {
        if (p.uuid !== passageUuid) return p;
        const merged = { ...p, ...patch };
        return { ...merged, ...clampPassageOffset(rack, merged.offset_along_cm, merged.width_cm) };
      });
      return { ...rack, passages };
    }),
  };
}

export function deleteRackPassage(layout: LayoutState, rackUuidKey: string, passageUuid: string): LayoutState {
  return {
    ...layout,
    racks: layout.racks.map((rack) => {
      if (rackUuid(rack) !== rackUuidKey) return rack;
      return { ...rack, passages: (rack.passages ?? []).filter((p) => p.uuid !== passageUuid) };
    }),
  };
}

export function findRackPassage(
  layout: LayoutState,
  rackUuidKey: string,
  passageUuid: string
): { rack: RackState; passage: RackPassageState } | null {
  const rack = findRackByUuid(layout.racks, rackUuidKey);
  if (!rack) return null;
  const passage = (rack.passages ?? []).find((p) => p.uuid === passageUuid);
  if (!passage) return null;
  return { rack, passage };
}
