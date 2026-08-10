import { describe, expect, it } from "vitest";
import {
  findActiveCartStatusRow,
  findActiveStatusRowForSession,
  looksLikePickingCartCode,
  mergeActiveSessionIntoStatusRows,
  operatorHasActiveCartSession,
  scanMatchesAssignedCart,
  statusRowHasActiveSession,
  statusRowNeedsCartScanToStart,
  statusRowShowScanCartCta,
  statusRowShowSessionProgress,
  statusRowCartBadgeLabel,
} from "./wmsPickingStatusSession";

describe("statusRowHasActiveSession / CTA / progress", () => {
  it("active session with cart → badge + progress, no in-card CTA", () => {
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
    expect(statusRowNeedsCartScanToStart(r)).toBe(false);
  });

  it("other status without session → no progress; needs scan unless operator has cart", () => {
    const baskets = {
      source_status_id: 6,
      require_cart: true,
      cart_type: "BASKETS" as const,
      has_operator_active_session: false,
      in_progress_by_me: 0,
    };
    expect(statusRowShowSessionProgress(baskets)).toBe(false);
    expect(statusRowShowScanCartCta(baskets)).toBe(false);
    expect(statusRowNeedsCartScanToStart(baskets)).toBe(true);
    expect(
      statusRowNeedsCartScanToStart(baskets, { operatorHasActiveCartSession: true }),
    ).toBe(false);
  });

  it("no session → needs scan (central prompt), never in-card CTA, no progress", () => {
    const r = {
      source_status_id: 7,
      require_cart: true,
      cart_type: "BULK" as const,
      has_operator_active_session: false,
      in_progress_by_me: 0,
    };
    expect(statusRowShowScanCartCta(r)).toBe(false);
    expect(statusRowNeedsCartScanToStart(r)).toBe(true);
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

describe("findActiveCartStatusRow / merge", () => {
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

  it("mergeActiveSessionIntoStatusRows binds by cart type without mixing", () => {
    const rows = [
      { source_status_id: 6, require_cart: true, cart_type: "BASKETS" as const, in_progress_by_me: 0 },
      { source_status_id: 7, require_cart: true, cart_type: "BULK" as const, in_progress_by_me: 0 },
    ];
    const active = {
      has_active_session: true,
      session_id: 10,
      source_status_id: null,
      order_type: "all" as const,
      has_cart: true,
      cart_id: 1,
      cart_code: "CART-0001",
      cart_name: "120X80",
      cart_type: "BULK" as const,
      products_picked: 0,
      products_total: 2,
    };
    const merged = mergeActiveSessionIntoStatusRows(rows, active);
    expect(merged.find((r) => r.source_status_id === 7)?.active_cart_id).toBe(1);
    expect(merged.find((r) => r.source_status_id === 7)?.session_products_total).toBe(2);
    expect(merged.find((r) => r.source_status_id === 6)?.active_cart_id).toBeUndefined();
    expect(findActiveStatusRowForSession(merged, active)?.source_status_id).toBe(7);
  });
});
