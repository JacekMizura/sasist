import type { LocationVisualRackGridCell } from "../../../api/wmsLocationVisualApi";

export type FloorBounds = {
  minX: number;
  minY: number;
  w: number;
  h: number;
};

export type FloorAisle = {
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: "h" | "v";
  label?: string;
};

export type FloorZone = {
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FloorLayout = {
  bounds: FloorBounds;
  zoneBoxes: FloorZone[];
  aisles: FloorAisle[];
  focusId: number | null;
  activeId: number | null;
};

export const ZONE_META: Record<
  string,
  { label: string; floorTint: string; accent: string; glow: string }
> = {
  A1: { label: "Kompletacja", floorTint: "rgba(59,130,246,0.07)", accent: "#4a7fd4", glow: "rgba(59,130,246,0.35)" },
  B1: { label: "Przyjęcie", floorTint: "rgba(34,197,94,0.07)", accent: "#3d9e62", glow: "rgba(34,197,94,0.32)" },
  C1: { label: "Składowanie", floorTint: "rgba(180,140,60,0.08)", accent: "#b8943a", glow: "rgba(234,179,8,0.28)" },
  D1: { label: "Outbound", floorTint: "rgba(168,85,247,0.06)", accent: "#9b6fd4", glow: "rgba(168,85,247,0.28)" },
  S1: { label: "Sklep", floorTint: "rgba(244,114,182,0.06)", accent: "#d46a9a", glow: "rgba(244,114,182,0.25)" },
};

export function zoneMeta(code: string) {
  const key = (code || "").trim().toUpperCase();
  return (
    ZONE_META[key] || {
      label: `Strefa ${code || "?"}`,
      floorTint: "rgba(100,116,139,0.06)",
      accent: "#6b7f96",
      glow: "rgba(148,163,184,0.25)",
    }
  );
}

function gapRectsBetween(
  items: { start: number; end: number }[],
  axisStart: number,
  axisEnd: number,
  minGap: number,
): { start: number; end: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const gaps: { start: number; end: number }[] = [];
  let cursor = axisStart;
  for (const item of sorted) {
    if (item.start - cursor >= minGap) gaps.push({ start: cursor, end: item.start });
    cursor = Math.max(cursor, item.end);
  }
  if (axisEnd - cursor >= minGap) gaps.push({ start: cursor, end: axisEnd });
  return gaps;
}

export function computeFloorLayout(
  cells: LocationVisualRackGridCell[],
  focusedRackId?: number | null,
): FloorLayout | null {
  if (!cells.length) return null;

  const pad = 0.06;
  const minX = Math.min(...cells.map((c) => c.x)) - pad;
  const minY = Math.min(...cells.map((c) => c.y)) - pad;
  const maxX = Math.max(...cells.map((c) => c.x + c.width)) + pad;
  const maxY = Math.max(...cells.map((c) => c.y + c.height)) + pad;
  const bounds: FloorBounds = { minX, minY, w: maxX - minX, h: maxY - minY };

  const zones = new Map<string, LocationVisualRackGridCell[]>();
  for (const c of cells) {
    const z = (c.zone_code || "Inna").trim();
    const list = zones.get(z) || [];
    list.push(c);
    zones.set(z, list);
  }

  const zoneBoxes: FloorZone[] = Array.from(zones.entries()).map(([code, rackCells]) => {
    const zx = Math.min(...rackCells.map((c) => c.x));
    const zy = Math.min(...rackCells.map((c) => c.y));
    const zx2 = Math.max(...rackCells.map((c) => c.x + c.width));
    const zy2 = Math.max(...rackCells.map((c) => c.y + c.height));
    return { code, x: zx - 0.018, y: zy - 0.018, width: zx2 - zx + 0.036, height: zy2 - zy + 0.036 };
  });

  const minAisle = Math.max(0.018, bounds.w * 0.045);
  const xSpans = cells.map((c) => ({ start: c.x, end: c.x + c.width }));
  const ySpans = cells.map((c) => ({ start: c.y, end: c.y + c.height }));

  const hGaps = gapRectsBetween(ySpans, minY + pad * 0.3, maxY - pad * 0.3, minAisle);
  const vGaps = gapRectsBetween(xSpans, minX + pad * 0.3, maxX - pad * 0.3, minAisle);

  const aisles: FloorAisle[] = [];
  hGaps.forEach((g, i) => {
    aisles.push({
      x: minX,
      y: g.start,
      width: bounds.w,
      height: g.end - g.start,
      orientation: "h",
      label: `A-${i + 1}`,
    });
  });
  vGaps.forEach((g, i) => {
    aisles.push({
      x: g.start,
      y: minY,
      width: g.end - g.start,
      height: bounds.h,
      orientation: "v",
      label: `V-${i + 1}`,
    });
  });

  const activeId = cells.find((c) => c.is_active)?.id ?? cells[0]?.id ?? null;
  const focusId = focusedRackId ?? activeId;

  return { bounds, zoneBoxes, aisles, focusId, activeId };
}

export function toFloorSvg(x: number, y: number, bounds: FloorBounds) {
  return {
    x: ((x - bounds.minX) / bounds.w) * 1000,
    y: ((y - bounds.minY) / bounds.h) * 640,
  };
}

export function toFloorSvgSize(n: number, bounds: FloorBounds, axis: "x" | "y") {
  const total = axis === "x" ? bounds.w : bounds.h;
  const view = axis === "x" ? 1000 : 640;
  return (n / total) * view;
}
