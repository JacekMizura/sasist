/**
 * Grid-based routing: walkable cells are those not covered by any rack footprint.
 * Pathfinding: A* with Manhattan heuristic, 4-neighborhood (no diagonals).
 */

import type { LayoutState, RackState } from "../../types/warehouse";

export type GridCell = { ix: number; iy: number };

/** Cell [ix, ix+1) × [iy, iy+1) overlaps rack axis-aligned rect. */
export function cellOverlapsRack(ix: number, iy: number, r: RackState): boolean {
  const ax0 = ix;
  const ax1 = ix + 1;
  const ay0 = iy;
  const ay1 = iy + 1;
  const bx0 = r.x;
  const bx1 = r.x + r.width;
  const by0 = r.y;
  const by1 = r.y + r.height;
  return !(ax1 <= bx0 || ax0 >= bx1 || ay1 <= by0 || ay0 >= by1);
}

/** `walkable[iy][ix]` — true when cell is inside grid and not under any rack. */
export function buildWalkabilityGrid(layout: LayoutState): boolean[][] {
  const W = Math.max(0, Math.floor(layout.grid_cols));
  const H = Math.max(0, Math.floor(layout.grid_rows));
  const racks = layout.racks ?? [];
  const grid: boolean[][] = [];
  for (let iy = 0; iy < H; iy += 1) {
    const row: boolean[] = [];
    for (let ix = 0; ix < W; ix += 1) {
      let blocked = false;
      for (const r of racks) {
        if (cellOverlapsRack(ix, iy, r)) {
          blocked = true;
          break;
        }
      }
      row.push(!blocked);
    }
    grid.push(row);
  }
  return grid;
}

function cellKey(ix: number, iy: number): string {
  return `${ix},${iy}`;
}

/**
 * BFS from (floor-clamped) seed to nearest walkable cell (Manhattan steps).
 */
export function nearestWalkableCell(
  px: number,
  py: number,
  walkable: boolean[][]
): GridCell | null {
  const rows = walkable.length;
  const cols = walkable[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return null;
  const ix0 = Math.max(0, Math.min(cols - 1, Math.floor(px)));
  const iy0 = Math.max(0, Math.min(rows - 1, Math.floor(py)));
  const q: GridCell[] = [{ ix: ix0, iy: iy0 }];
  const seen = new Set<string>([cellKey(ix0, iy0)]);
  let head = 0;
  while (head < q.length) {
    const { ix, iy } = q[head++];
    if (walkable[iy][ix]) return { ix, iy };
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nx = ix + dx;
      const ny = iy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const k = cellKey(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ ix: nx, iy: ny });
    }
  }
  return null;
}

type HeapItem = { f: number; g: number; ix: number; iy: number };

function heapPush(heap: HeapItem[], item: HeapItem): void {
  let i = heap.length;
  heap.push(item);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p].f <= heap[i].f) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}

function heapPop(heap: HeapItem[]): HeapItem | undefined {
  if (heap.length === 0) return undefined;
  const ret = heap[0];
  const last = heap.pop()!;
  if (heap.length === 0) return ret;
  heap[0] = last;
  let i = 0;
  for (;;) {
    const l = i * 2 + 1;
    const r = l + 1;
    let sm = i;
    if (l < heap.length && heap[l].f < heap[sm].f) sm = l;
    if (r < heap.length && heap[r].f < heap[sm].f) sm = r;
    if (sm === i) break;
    [heap[i], heap[sm]] = [heap[sm], heap[i]];
    i = sm;
  }
  return ret;
}

const NEIGH4: readonly [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

/**
 * Shortest path on 4-grid (unit cost per step). A* with Manhattan heuristic.
 * Returns cell indices from start to end inclusive, or null if unreachable.
 */
export function findPathAStarGrid(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  walkable: boolean[][]
): GridCell[] | null {
  const rows = walkable.length;
  const cols = walkable[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return null;
  if (sx < 0 || sx >= cols || sy < 0 || sy >= rows || ex < 0 || ex >= cols || ey < 0 || ey >= rows) {
    return null;
  }
  if (!walkable[sy][sx] || !walkable[ey][ex]) return null;
  if (sx === ex && sy === ey) return [{ ix: sx, iy: sy }];

  const h = (x: number, y: number) => Math.abs(ex - x) + Math.abs(ey - y);

  const bestG = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const heap: HeapItem[] = [];

  const sk = cellKey(sx, sy);
  bestG.set(sk, 0);
  parent.set(sk, null);
  heapPush(heap, { f: h(sx, sy), g: 0, ix: sx, iy: sy });

  while (heap.length > 0) {
    const cur = heapPop(heap)!;
    const ck = cellKey(cur.ix, cur.iy);
    const recorded = bestG.get(ck);
    if (recorded === undefined || cur.g !== recorded) continue;

    if (cur.ix === ex && cur.iy === ey) {
      const out: GridCell[] = [];
      let k: string | null = ck;
      while (k != null) {
        const [ix, iy] = k.split(",").map(Number);
        out.push({ ix, iy });
        k = parent.get(k) ?? null;
      }
      out.reverse();
      return out;
    }

    for (const [dx, dy] of NEIGH4) {
      const nx = cur.ix + dx;
      const ny = cur.iy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (!walkable[ny][nx]) continue;
      const ng = cur.g + 1;
      const nk = cellKey(nx, ny);
      const prev = bestG.get(nk);
      if (prev !== undefined && ng >= prev) continue;
      bestG.set(nk, ng);
      parent.set(nk, ck);
      heapPush(heap, { f: ng + h(nx, ny), g: ng, ix: nx, iy: ny });
    }
  }

  return null;
}

/** Cell centers (ix+0.5, iy+0.5) for polyline rendering — not cell edges. */
export function gridPathToCellCenterPoints(cells: GridCell[]): { x: number; y: number }[] {
  return cells.map(({ ix, iy }) => ({ x: ix + 0.5, y: iy + 0.5 }));
}

export function validatePointsOnWalkableGrid(
  points: { x: number; y: number }[],
  walkable: boolean[][]
): boolean {
  const rows = walkable.length;
  const cols = walkable[0]?.length ?? 0;
  for (const p of points) {
    const ix = Math.floor(p.x);
    const iy = Math.floor(p.y);
    if (ix < 0 || ix >= cols || iy < 0 || iy >= rows) return false;
    if (!walkable[iy][ix]) return false;
  }
  return true;
}
