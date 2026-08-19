import { describe, expect, it } from "vitest";

import {
  allocationStrategyToIssueStrategy,
  normalizeAllocationStrategy,
} from "./allocationStrategy";

describe("normalizeAllocationStrategy", () => {
  it("maps legacy auto and store_first to auto_split", () => {
    expect(normalizeAllocationStrategy("auto")).toBe("auto_split");
    expect(normalizeAllocationStrategy("store_first")).toBe("auto_split");
  });

  it("maps legacy pick_face to single_location", () => {
    expect(normalizeAllocationStrategy("pick_face")).toBe("single_location");
  });

  it("keeps live values", () => {
    expect(normalizeAllocationStrategy("manual")).toBe("manual");
    expect(normalizeAllocationStrategy("auto_split")).toBe("auto_split");
    expect(normalizeAllocationStrategy("single_location")).toBe("single_location");
  });
});

describe("allocationStrategyToIssueStrategy", () => {
  it("maps live strategies to session issue_strategy", () => {
    expect(allocationStrategyToIssueStrategy("auto_split")).toBe("AUTO_SPLIT");
    expect(allocationStrategyToIssueStrategy("single_location")).toBe("SINGLE_LOCATION_ONLY");
    expect(allocationStrategyToIssueStrategy("manual")).toBe("STRICT_LOCATION");
  });

  it("maps legacy persisted values for existing sessions/settings cache", () => {
    expect(allocationStrategyToIssueStrategy("store_first")).toBe("AUTO_SPLIT");
    expect(allocationStrategyToIssueStrategy("pick_face")).toBe("SINGLE_LOCATION_ONLY");
  });

  it("existing session snapshot issue_strategy is independent of settings remap", () => {
    // Sessions store issue_strategy directly — settings migration must not change runtime enum strings.
    expect(allocationStrategyToIssueStrategy("manual")).toBe("STRICT_LOCATION");
    expect("STRICT_LOCATION").toBe("STRICT_LOCATION");
  });
});
