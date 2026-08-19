import type { AllocationStrategy } from "../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";

/** Legacy persisted values — normalized on read, never written by the settings form. */
export type LegacyAllocationStrategy = "auto" | "store_first" | "pick_face" | "manual";

/** Map legacy + live allocation_strategy → session issue_strategy snapshot. */
export function normalizeAllocationStrategy(raw: unknown): AllocationStrategy {
  const s = String(raw ?? "").trim().toLowerCase();
  switch (s) {
    case "auto":
    case "store_first":
    case "auto_split":
      return "auto_split";
    case "pick_face":
    case "single_location":
      return "single_location";
    case "manual":
      return "manual";
    default:
      return "auto_split";
  }
}

/** Maps WMS settings allocation strategy → direct-sale session issue_strategy. */
export function allocationStrategyToIssueStrategy(strategy: AllocationStrategy | LegacyAllocationStrategy): string {
  switch (normalizeAllocationStrategy(strategy)) {
    case "manual":
      return "STRICT_LOCATION";
    case "single_location":
      return "SINGLE_LOCATION_ONLY";
    case "auto_split":
    default:
      return "AUTO_SPLIT";
  }
}
