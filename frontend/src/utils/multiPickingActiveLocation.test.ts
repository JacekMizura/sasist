import { describe, expect, it } from "vitest";
import { nextActiveLocationIdAfterDetail } from "./multiPickingActiveLocation";

describe("nextActiveLocationIdAfterDetail", () => {
  const a10 = { location_id: 10, stock_quantity: 0 };
  const a23 = { location_id: 23, stock_quantity: 4 };

  it("single location auto-selects", () => {
    expect(
      nextActiveLocationIdAfterDetail({
        previousId: null,
        locations: [a23],
        productChanged: false,
      }),
    ).toBe(23);
  });

  it("preserves active location after detail refresh when stock remains", () => {
    expect(
      nextActiveLocationIdAfterDetail({
        previousId: 23,
        locations: [a10, a23],
        productChanged: false,
      }),
    ).toBe(23);
  });

  it("clears when effective stock is 0", () => {
    expect(
      nextActiveLocationIdAfterDetail({
        previousId: 10,
        locations: [a10, a23],
        productChanged: false,
      }),
    ).toBeNull();
  });

  it("clears on product change (no FIFO fallback)", () => {
    expect(
      nextActiveLocationIdAfterDetail({
        previousId: 23,
        locations: [a10, a23],
        productChanged: true,
      }),
    ).toBeNull();
  });

  it("after picking down to effective 0, clears active location", () => {
    expect(
      nextActiveLocationIdAfterDetail({
        previousId: 23,
        locations: [
          { location_id: 10, stock_quantity: 0 },
          { location_id: 23, stock_quantity: 0 },
        ],
        productChanged: false,
      }),
    ).toBeNull();
  });

  it("keeps A23 after partial pick when effective remains > 0", () => {
    expect(
      nextActiveLocationIdAfterDetail({
        previousId: 23,
        locations: [
          { location_id: 10, stock_quantity: 0 },
          { location_id: 23, stock_quantity: 2 },
        ],
        productChanged: false,
      }),
    ).toBe(23);
  });
});
