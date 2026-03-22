import type { RackState } from "../../types/warehouse";
import { getRackAccessPointCell } from "./rackAccessPoint";

/** Max |Δy| (cells) for two rack centers to share a horizontal aisle (row). */
export const AISLE_Y_TOLERANCE_CELLS = 2.5;
/** Max |Δx| (cells) for two rack centers to share a vertical aisle (column). */
export const AISLE_X_TOLERANCE_CELLS = 2.5;

function rackCenter(r: RackState): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function rackKey(r: RackState): string {
  return String(r.id ?? r.rack_index);
}

function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function clusterByCenter1D(
  racks: RackState[],
  coord: "x" | "y",
  tolerance: number
): RackState[][] {
  const n = racks.length;
  if (n === 0) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };
  const c = (i: number) => (coord === "x" ? rackCenter(racks[i]).x : rackCenter(racks[i]).y);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(c(i) - c(j)) < tolerance) union(i, j);
    }
  }
  const map = new Map<number, RackState[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!map.has(root)) map.set(root, []);
    map.get(root)!.push(racks[i]);
  }
  return [...map.values()];
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Prefer horizontal (row) aisles when layout is wider than tall; else vertical. */
function useHorizontalAisles(racks: RackState[]): boolean {
  if (racks.length < 2) return true;
  const cx = racks.map((r) => rackCenter(r).x);
  const cy = racks.map((r) => rackCenter(r).y);
  const spreadX = Math.max(...cx) - Math.min(...cx);
  const spreadY = Math.max(...cy) - Math.min(...cy);
  if (spreadY < 1e-6) return true;
  if (spreadX < 1e-6) return false;
  return spreadX >= spreadY;
}

/**
 * Picking visit order: group by aisle → sort along aisle → serpentine between aisles.
 * No global TSP / nearest-neighbor on rack centers.
 */
export function computePickingRouteOrder(
  rackIds: string[],
  racks: RackState[],
  pickStartCell: { x: number; y: number } | null
): string[] {
  const unique = [...new Set(rackIds)];
  const byId = new Map<string, RackState>();
  for (const r of racks) byId.set(rackKey(r), r);
  const list: RackState[] = [];
  for (const id of unique) {
    const r = byId.get(id);
    if (r) list.push(r);
  }
  if (list.length <= 1) return list.map(rackKey);

  const horizontal = useHorizontalAisles(list);
  const aisles = horizontal
    ? clusterByCenter1D(list, "y", AISLE_Y_TOLERANCE_CELLS)
    : clusterByCenter1D(list, "x", AISLE_X_TOLERANCE_CELLS);

  if (horizontal) {
    aisles.sort(
      (a, b) => mean(a.map((r) => rackCenter(r).y)) - mean(b.map((r) => rackCenter(r).y))
    );
  } else {
    aisles.sort(
      (a, b) => mean(a.map((r) => rackCenter(r).x)) - mean(b.map((r) => rackCenter(r).x))
    );
  }

  const pick = pickStartCell ?? getRackAccessPointCell(list[0]);

  const firstAisle = [...aisles[0]].sort((a, b) =>
    horizontal ? rackCenter(a).x - rackCenter(b).x : rackCenter(a).y - rackCenter(b).y
  );
  const apFirst = getRackAccessPointCell(firstAisle[0]);
  const apLast = getRackAccessPointCell(firstAisle[firstAisle.length - 1]);
  let firstForward = firstAisle.length === 1 ? true : dist2(pick, apFirst) <= dist2(pick, apLast);

  const out: string[] = [];
  for (let k = 0; k < aisles.length; k++) {
    const aisle = [...aisles[k]].sort((a, b) =>
      horizontal ? rackCenter(a).x - rackCenter(b).x : rackCenter(a).y - rackCenter(b).y
    );
    const useAsc = k % 2 === 0 ? firstForward : !firstForward;
    const ordered = useAsc ? aisle : [...aisle].reverse();
    for (const r of ordered) out.push(rackKey(r));
  }

  return out;
}
