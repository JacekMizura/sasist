import { describe, expect, it } from "vitest";
import {
  findActiveCartStatusRow,
  looksLikePickingCartCode,
  operatorHasActiveCartSession,
  scanMatchesAssignedCart,
  statusRowHasActiveSession,
  statusRowShowScanCartCta,
  statusRowShowSessionProgress,
  statusRowCartBadgeLabel,
} from "./wmsPickingStatusSession";

describe("statusRowHasActiveSession / CTA / progress", () => {
  it("active session with cart → badge + progress, no CTA", () => {
    const r = {
      source_status_id: 7,
      require_cart: true,
      cart_type: "BULK" as const,
      has_operator_active_session: true,
      active_cart_id: 1,
      active_cart_name: "120X80",
      active_cart_code: "CART-0001",
      in_progress_by_me: 1,
      session_products_total: 2,
      session_products_picked: 0,
    };
    expect(statusRowHasActiveSession(r)).toBe(true);
    expect(statusRowCartBadgeLabel(r)).toBe("120X80");
    expect(statusRowShowSessionProgress(r)).toBe(true);
    expect(statusRowShowScanCartCta(r)).toBe(false);
  });

  it("other status without session → no progress; CTA hidden if operator has cart session", () => {
    const baskets = {
      source_status_id: 6,
      require_cart: true,
      cart_type: "BASKETS" as const,
      has_operator_active_session: false,
      in_progress_by_me: 0,
    };
    expect(statusRowShowSessionProgress(baskets)).toBe(false);
    expect(statusRowShowScanCartCta(baskets)).toBe(true);
    expect(
      statusRowShowScanCartCta(baskets, { operatorHasActiveCartSession: true }),
    ).toBe(false);
  });

  it("no session → CTA, no progress", () => {
    const r = {
      source_status_id: 7,
      require_cart: true,
      cart_type: "BULK" as const,
      has_operator_active_session: false,
      in_progress_by_me: 0,
    };
    expect(statusRowShowScanCartCta(r)).toBe(true);
    expect(statusRowShowSessionProgress(r)).toBe(false);
    expect(statusRowCartBadgeLabel(r)).toBeNull();
  });
});

describe("operatorHasActiveCartSession", () => {
  it("true from active API or row", () => {
    expect(
      operatorHasActiveCartSession(
        {
          has_active_session: true,
          session_id: 124,
          source_status_id: 7,
          order_type: "all",
          has_cart: true,
          cart_id: 1,
          cart_code: "CART-0001",
          cart_name: "120X80",
          cart_type: "BULK",
        },
        [],
      ),
    ).toBe(true);
    expect(
      operatorHasActiveCartSession(null, [
        {
          source_status_id: 7,
          require_cart: true,
          active_cart_id: 1,
          in_progress_by_me: 1,
        },
      ]),
    ).toBe(true);
  });
});

describe("cart scan matching", () => {
  it("matches CART-0001 codes", () => {
    expect(looksLikePickingCartCode("CART-0001")).toBe(true);
    expect(
      scanMatchesAssignedCart("CART-0001", { cartCode: "CART-0001", cartName: "120X80", cartId: 1 }),
    ).toBe(true);
    expect(scanMatchesAssignedCart("CART-0001", { cartCode: "CART-0002", cartId: 2 })).toBe(false);
  });
});

describe("findActiveCartStatusRow", () => {
  it("picks row with cart", () => {
    const rows = [
      { source_status_id: 6, require_cart: true, cart_type: "BASKETS" as const },
      {
        source_status_id: 7,
        require_cart: true,
        cart_type: "BULK" as const,
        active_cart_id: 1,
        active_cart_code: "CART-0001",
        in_progress_by_me: 1,
      },
    ];
    expect(findActiveCartStatusRow(rows)?.source_status_id).toBe(7);
  });
});
