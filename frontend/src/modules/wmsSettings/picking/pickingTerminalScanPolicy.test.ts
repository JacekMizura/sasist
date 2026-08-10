import { describe, expect, it } from "vitest";
import {
  computeNeedsLocationScan,
  DEFAULT_PICKING_TERMINAL_SCAN_POLICY,
} from "./pickingTerminalScanPolicy";

describe("computeNeedsLocationScan", () => {
  it("requires scan when requireLocationScan is on", () => {
    expect(
      computeNeedsLocationScan({
        locationCount: 1,
        requireLocationScan: true,
        disableForceLocationScanWhenManyLocations: true,
      }),
    ).toBe(true);
  });

  it("requires scan for multi-loc unless disabled", () => {
    expect(
      computeNeedsLocationScan({
        locationCount: 2,
        requireLocationScan: false,
        disableForceLocationScanWhenManyLocations: false,
      }),
    ).toBe(true);
    expect(
      computeNeedsLocationScan({
        locationCount: 2,
        requireLocationScan: false,
        disableForceLocationScanWhenManyLocations: true,
      }),
    ).toBe(false);
  });

  it("does not force scan for single-loc by default", () => {
    expect(
      computeNeedsLocationScan({
        locationCount: 1,
        requireLocationScan: DEFAULT_PICKING_TERMINAL_SCAN_POLICY.requireLocationScan,
        disableForceLocationScanWhenManyLocations:
          DEFAULT_PICKING_TERMINAL_SCAN_POLICY.disableForceLocationScanWhenManyLocations,
      }),
    ).toBe(false);
  });
});
