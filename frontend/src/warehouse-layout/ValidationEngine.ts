/**
 * Layout validation: configurable constraints, non-blocking warnings.
 */

export type ValidationConstraints = {
  minAisleWidth?: number;
  minDistanceBetweenRows?: number;
  hallBoundaryLimit?: { minX?: number; minY?: number; maxX?: number; maxY?: number };
};

export type ValidationViolation = {
  id: string;
  type: "aisle_width" | "row_distance" | "boundary";
  message: string;
  area?: { x: number; y: number; width: number; height: number };
  severity: "warning";
};

export type ValidationResult = {
  valid: boolean;
  violations: ValidationViolation[];
};

type ValidateContext = {
  racks?: Array<{ x: number; y: number; width: number; height: number }>;
  aisles?: Array<{ x: number; y: number; width: number; height: number }>;
  rowContainers?: Array<{ slots: Array<{ x: number; y: number; w: number; h: number }> }>;
  gridCols?: number;
  gridRows?: number;
};

export function validateLayout(
  constraints: ValidationConstraints,
  context: ValidateContext
): ValidationResult {
  const violations: ValidationViolation[] = [];

  if (constraints.hallBoundaryLimit && (context.gridCols != null || context.gridRows != null)) {
    const lim = constraints.hallBoundaryLimit;
    const minX = lim.minX ?? 0;
    const minY = lim.minY ?? 0;
    const maxX = lim.maxX ?? context.gridCols ?? 0;
    const maxY = lim.maxY ?? context.gridRows ?? 0;
    for (const r of context.racks ?? []) {
      if (r.x < minX || r.y < minY || r.x + r.width > maxX || r.y + r.height > maxY) {
        violations.push({
          id: `boundary-${r.x}-${r.y}`,
          type: "boundary",
          message: "Regał wykracza poza granice hali",
          area: { x: r.x, y: r.y, width: r.width, height: r.height },
          severity: "warning",
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
