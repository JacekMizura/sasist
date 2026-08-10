import { describe, expect, it } from "vitest";
import { isCartlessPickingSession } from "./wmsPickingSessionKind";

describe("isCartlessPickingSession", () => {
  it("cart-bound session with pickingSessionId is NOT cartless", () => {
    expect(
      isCartlessPickingSession({
        cartId: 5,
        pickingSessionId: 124,
        cartless: false,
      }),
    ).toBe(false);
  });

  it("explicit cartless without cart is cartless", () => {
    expect(isCartlessPickingSession({ cartless: true, pickingSessionId: 10 })).toBe(true);
  });

  it("session id without cart is cartless", () => {
    expect(isCartlessPickingSession({ pickingSessionId: 124 })).toBe(true);
  });

  it("cart id alone is not cartless", () => {
    expect(isCartlessPickingSession({ cartId: 1 })).toBe(false);
  });
});
