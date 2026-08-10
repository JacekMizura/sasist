import { describe, expect, it } from "vitest";
import {
  findActiveCartStatusRow,
  looksLikePickingCartCode,
  scanMatchesAssignedCart,
  statusRowHasActiveSession,
  statusRowShowScanCartCta,
  statusRowCartBadgeLabel,
} from "./wmsPickingStatusSession";

describe("statusRowHasActiveSession / CTA", () => {
  it("active session with cart → badge, no CTA", () => {
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
    expect(statusRowShowScanCartCta(r)).toBe(false);
  });

  it("in_progress_by_me alone → no CTA", () => {
    const r = {
      source_status_id: 7,
      require_cart: true,
      cart_type: "BULK" as const,
      in_progress_by_me: 1,
      active_cart_name: "120X80",
    };
    expect(statusRowShowScanCartCta(r)).toBe(false);
    expect(statusRowCartBadgeLabel(r)).toBe("120X80");
  });

  it("no session → CTA", () => {
    const r = {
      source_status_id: 7,
      require_cart: true,
      cart_type: "BULK" as const,
      has_operator_active_session: false,
      in_progress_by_me: 0,
    };
    expect(statusRowShowScanCartCta(r)).toBe(true);
    expect(statusRowCartBadgeLabel(r)).toBeNull();
  });

  it("never CTA when badge would show", () => {
    const r = {
      source_status_id: 7,
      require_cart: true,
      cart_type: "BASKETS" as const,
      active_cart_id: 1,
      active_cart_type: "BULK" as const,
      active_cart_name: "120X80",
      in_progress_by_me: 1,
    };
    // Type mismatch tile vs cart — sesja i tak aktywna → brak CTA
    expect(statusRowShowScanCartCta(r)).toBe(false);
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
