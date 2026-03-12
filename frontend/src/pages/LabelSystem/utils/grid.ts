export const GRID_SIZE_MM = 1;

export function snapToGrid(mm: number): number {
  return Math.round(mm / GRID_SIZE_MM) * GRID_SIZE_MM;
}
