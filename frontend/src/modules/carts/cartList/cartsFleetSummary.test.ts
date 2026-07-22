import { describe, expect, it } from "vitest";

import { CARTS_TABS } from "../cartsTabs";
import { computeCartsFleetSummary, globalFleetFillPercent } from "./cartsFleetSummary";

describe("CARTS_TABS", () => {
  it("keeps Magazyn tab order from reference screens", () => {
    expect(CARTS_TABS.map((t) => t.label)).toEqual([
      "Wózki",
      "Wózki z koszykami",
      "Regały",
      "Strefy",
      "Planer floty",
      "Nośniki",
    ]);
  });
});

describe("computeCartsFleetSummary", () => {
  it("derives KPI from real cart rows (no hardcoded fill)", () => {
    const summary = computeCartsFleetSummary([
      {
        id: 1,
        name: "G",
        items: [
          { id: 1, name: "A", status: "AVAILABLE", total_volume_dm3: 100, used_volume: 10 },
          { id: 2, name: "B", status: "IN_USE", total_volume_dm3: 50, used_volume: 25 },
        ],
      },
    ]);
    expect(summary.totalUnits).toBe(2);
    expect(summary.available).toBe(1);
    expect(summary.inUse).toBe(1);
    expect(summary.totalVolume).toBe(150);
    expect(summary.totalUsedVolume).toBe(35);
    expect(globalFleetFillPercent(summary)).toBe(23);
  });
});
