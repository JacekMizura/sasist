/**
 * Rack service-face SSOT (mirrors backend rack_service_face.py).
 *
 * serviceSide + rotationDegrees → world normal into the service aisle.
 * Do not use bin_direction as a hidden face substitute after generation.
 */

export type ServiceSide = "FRONT" | "BACK";
export type RotationDegrees = 0 | 90 | 180 | 270;

export {
  ServiceFaceOrigin,
  normalizeServiceFaceOrigin,
  type ServiceFaceOrigin,
} from "../../types/warehouse";

export type ServiceFace = {
  serviceSide: ServiceSide;
  rotationDegrees: RotationDegrees;
};

export type Vec2 = { x: number; y: number };

const SUPPORTED: RotationDegrees[] = [0, 90, 180, 270];

export function normalizeRotation(raw: unknown): RotationDegrees {
  let r = Number(raw);
  if (!Number.isFinite(r)) return 0;
  r = ((Math.round(r) % 360) + 360) % 360;
  if ((SUPPORTED as number[]).includes(r)) return r as RotationDegrees;
  return SUPPORTED.reduce((best, s) => {
    const d = Math.min(Math.abs(s - r), 360 - Math.abs(s - r));
    const bd = Math.min(Math.abs(best - r), 360 - Math.abs(best - r));
    return d < bd ? s : best;
  }, 0 as RotationDegrees);
}

export function localFrontNormal(orientation: string): Vec2 {
  return (orientation || "vertical").toLowerCase() === "horizontal"
    ? { x: 0, y: 1 }
    : { x: -1, y: 0 };
}

export function rotateVecCcw(v: Vec2, degrees: number): Vec2 {
  const d = normalizeRotation(degrees);
  if (d === 0) return v;
  if (d === 90) return { x: -v.y, y: v.x };
  if (d === 180) return { x: -v.x, y: -v.y };
  return { x: v.y, y: -v.x }; // 270
}

export function worldServiceNormal(
  orientation: string,
  rotationDegrees: unknown,
  serviceSide: unknown
): Vec2 {
  let n = rotateVecCcw(localFrontNormal(orientation), normalizeRotation(rotationDegrees));
  if (String(serviceSide || "FRONT").toUpperCase() === "BACK") {
    n = { x: -n.x, y: -n.y };
  }
  const mag = Math.hypot(n.x, n.y) || 1;
  return { x: n.x / mag, y: n.y / mag };
}

export function encodeFaceForWorldNormal(
  nx: number,
  ny: number,
  orientation: string = "vertical"
): ServiceFace {
  const mag = Math.hypot(nx, ny) || 1;
  const tx = nx / mag;
  const ty = ny / mag;
  for (const side of ["FRONT", "BACK"] as ServiceSide[]) {
    for (const rot of SUPPORTED) {
      const got = worldServiceNormal(orientation, rot, side);
      if (Math.abs(got.x - tx) < 1e-6 && Math.abs(got.y - ty) < 1e-6) {
        return { serviceSide: side, rotationDegrees: rot };
      }
    }
  }
  throw new Error(`Cannot encode normal (${nx},${ny}) for ${orientation}`);
}

export function faceForCardinal(
  direction: "NORTH" | "SOUTH" | "EAST" | "WEST",
  orientation: string = "vertical"
): ServiceFace {
  const map = {
    NORTH: { x: 0, y: -1 },
    SOUTH: { x: 0, y: 1 },
    WEST: { x: -1, y: 0 },
    EAST: { x: 1, y: 0 },
  } as const;
  const n = map[direction];
  return encodeFaceForWorldNormal(n.x, n.y, orientation);
}

/** Default for a single horizontal row of vertical racks: face south (+Y aisle). */
export function defaultHorizontalRowFace(): ServiceFace {
  return faceForCardinal("SOUTH", "vertical");
}

/**
 * Faces for a back-to-back horizontal pair (north row + south row).
 * Outer aisles: north faces NORTH, south faces SOUTH.
 */
export function backToBackHorizontalFaces(): { north: ServiceFace; south: ServiceFace } {
  return {
    north: faceForCardinal("NORTH", "vertical"),
    south: faceForCardinal("SOUTH", "vertical"),
  };
}
