/**
 * RackPassage local geometry helpers (mirrors backend physical_collision.passage_world_rect).
 * Passages are local to the rack footprint — move/rotate of rack moves the hole.
 */

import type { RackPassageState, RackState } from "../../../types/warehouse";
import { GRID_UNIT_CM } from "../../../types/warehouse";

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
