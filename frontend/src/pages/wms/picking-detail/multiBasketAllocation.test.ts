/**
 * Unit helpers for MULTI per-basket allocation math.
 */
import { describe, expect, it } from "vitest";
import {
  aggregateAllocations,
  allocationLineStatus,
  allocationUnresolved,
  unresolvedAllocations,
} from "./multiBasketAllocation";

describe("multiBasketAllocation", () => {
  const scenario = [
    { order_id: 1, order_item_id: 11, order_number: "1", basket_slot: "S-1-1", quantity: 1, picked_quantity: 1, missing_quantity: 0, quantity_to_pick: 0 },
    { order_id: 2, order_item_id: 12, order_number: "2", basket_slot: "S-1-2", quantity: 1, picked_quantity: 1, missing_quantity: 0, quantity_to_pick: 0 },
    { order_id: 3, order_item_id: 13, order_number: "3", basket_slot: "S-1-3", quantity: 2, picked_quantity: 2, missing_quantity: 0, quantity_to_pick: 0 },
    { order_id: 4, order_item_id: 14, order_number: "4", basket_slot: "S-1-4", quantity: 8, picked_quantity: 4, missing_quantity: 4, quantity_to_pick: 0 },
    { order_id: 5, order_item_id: 15, order_number: "5", basket_slot: "S-1-5", quantity: 8, picked_quantity: 0, missing_quantity: 8, quantity_to_pick: 0 },
  ];

  it("CASE 6 aggregate: required 20 / picked 8 / shortage 12 / unresolved 0", () => {
    expect(aggregateAllocations(scenario)).toEqual({
      required: 20,
      picked: 8,
      shortage: 12,
      unresolved: 0,
    });
  });

  it("line statuses for partial and full shortage", () => {
    expect(allocationLineStatus(scenario[0]!)).toBe("READY");
    expect(allocationLineStatus(scenario[3]!)).toBe("PARTIAL_SHORTAGE");
    expect(allocationLineStatus(scenario[4]!)).toBe("FULL_SHORTAGE");
  });

  it("partial pick leaves unresolved without auto-shortage", () => {
    const row = {
      order_id: 4,
      order_item_id: 14,
      order_number: "4",
      basket_slot: "S-1-4",
      quantity: 8,
      picked_quantity: 4,
      missing_quantity: 0,
      quantity_to_pick: 4,
    };
    expect(allocationUnresolved(row)).toBe(4);
    expect(allocationLineStatus(row)).toBe("PARTIAL_PICK");
    expect(unresolvedAllocations([row])).toHaveLength(1);
  });
});
