/**
 * Component-level regression: A1 (id=1) → scan B3-C-1 → active stays B3 through
 * detail/source_lock refresh → product quick-pick uses B3.id.
 *
 * Reproduces production false-match: "B3-C-1".endsWith("1") vs location_id=1.
 */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { locationRowMatchesScan } from "./pickingLocationScan";
import { usePickingActiveLocationController } from "./usePickingActiveLocationController";

afterEach(() => cleanup());

const A1 = { location_id: 1, location_code: "A1-A-1", stock_quantity: 1 };
const B3 = { location_id: 23, location_code: "B3-C-1", stock_quantity: 4 };
const B3C2 = { location_id: 24, location_code: "B3-C-2", stock_quantity: 2 };

describe("production false-match: B3-C-1 vs location_id=1", () => {
  it("STRICT: B3-C-1 must NOT match A1 location_id=1", () => {
    expect(locationRowMatchesScan(A1, "B3-C-1")).toBe(false);
    expect(locationRowMatchesScan(B3, "B3-C-1")).toBe(true);
  });
});

describe("usePickingActiveLocationController — A1 → scan B3 → quick-pick B3", () => {
  it("initial A1, scan B3, detail refetch with stale source_lock=A1 keeps B3; quick-pick=B3", () => {
    const { result, rerender } = renderHook(
      (props: {
        locations: typeof A1[];
        serverSourceLocationId: number | null;
        needsLocationScan: boolean;
      }) =>
        usePickingActiveLocationController({
          productId: 193,
          locations: props.locations,
          serverSourceLocationId: props.serverSourceLocationId,
          needsLocationScan: props.needsLocationScan,
        }),
      {
        initialProps: {
          locations: [A1, B3, B3C2],
          serverSourceLocationId: 1,
          needsLocationScan: true,
        },
      },
    );

    // After mount + effects: server lock A1
    expect(result.current.activeLocationId).toBe(1);
    expect(result.current.selectedLocation?.location_code).toBe("A1-A-1");

    let scanResult: ReturnType<typeof result.current.applyLocationScan>;
    act(() => {
      scanResult = result.current.applyLocationScan("B3-C-1");
    });
    expect(scanResult!).toMatchObject({
      kind: "accept",
      location_id: 23,
      location_code: "B3-C-1",
    });
    expect(result.current.activeLocationId).toBe(23);
    expect(result.current.selectedLocation?.location_code).toBe("B3-C-1");
    expect(result.current.quickPickLocationId).toBe(23);

    // Simulate detail refetch that still reports stale source_lock=A1
    rerender({
      locations: [A1, B3, B3C2],
      serverSourceLocationId: 1,
      needsLocationScan: true,
    });
    expect(result.current.activeLocationId).toBe(23);
    expect(result.current.quickPickLocationId).toBe(23);

    // Product scan would POST location_id = quickPickLocationId
    expect(result.current.quickPickLocationId).toBe(B3.location_id);
  });

  it("B3 outside allowed → WRONG_LOCATION; active stays A1; no B3 quick-pick", () => {
    const { result } = renderHook(() =>
      usePickingActiveLocationController({
        productId: 193,
        locations: [A1],
        serverSourceLocationId: 1,
        needsLocationScan: true,
      }),
    );

    expect(result.current.activeLocationId).toBe(1);

    let scanResult: ReturnType<typeof result.current.applyLocationScan>;
    act(() => {
      scanResult = result.current.applyLocationScan("B3-C-1");
    });
    expect(scanResult!.kind).toBe("reject_wrong");
    expect(result.current.activeLocationId).toBe(1);
    expect(result.current.quickPickLocationId).toBe(1);
  });
});
