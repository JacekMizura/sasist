import type { AllocationStrategy } from "../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";

/** Maps WMS settings allocation strategy → direct-sale session issue_strategy. */
export function allocationStrategyToIssueStrategy(strategy: AllocationStrategy): string {
  switch (strategy) {
    case "manual":
      return "STRICT_LOCATION";
    case "pick_face":
      return "SINGLE_LOCATION_ONLY";
    case "store_first":
    case "auto":
    default:
      return "AUTO_SPLIT";
  }
}
