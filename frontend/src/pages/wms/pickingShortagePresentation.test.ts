/**
 * Unit tests: MULTI shortage presentation (product aggregate vs allocation).
 */
import { describe, expect, it } from "vitest";
import {
  shortageProductCardHeadline,
  summarizeProductShortageAllocations,
  type PickingShortageAllocation,
} from "./pickingShortagePresentation";

describe("pickingShortagePresentation", () => {
  const liveExample: PickingShortageAllocation[] = [
    {
      order_id: 1234,
      order_number: "1234",
      order_item_id: 101,
      basket_label: "S-1-1",
      required_qty: 8,
      picked_qty: 7,
      shortage_qty: 1,
      unresolved_qty: 0,
    },
    {
      order_id: 1235,
      order_number: "1235",
      order_item_id: 102,
      basket_label: "S-1-2",
      required_qty: 1,
      picked_qty: 1,
      shortage_qty: 0,
      unresolved_qty: 0,
    },
  ];

  it("LIVE: #1234 shortage1 + #1235 shortage0 → points at #1234 / S-1-1", () => {
    const s = summarizeProductShortageAllocations(liveExample, 1);
    expect(s.shortageUnits).toBe(1);
    expect(s.ordersWithShortage).toBe(1);
    expect(s.affected).toHaveLength(1);
    expect(s.affected[0]!.order_id).toBe(1234);
    expect(s.affected[0]!.basket_label).toBe("S-1-1");
    const head = shortageProductCardHeadline(s);
    expect(head.title).toContain("1");
    expect(head.subtitle).toContain("1234");
    expect(head.subtitle).toContain("S-1-1");
    expect(head.subtitle).not.toContain("1235");
  });

  it("CASE 6: 12 szt. / 2 zamówienia — never only BRAK 12/20", () => {
    const rows: PickingShortageAllocation[] = [
      { order_id: 1, order_number: "1", order_item_id: 11, basket_label: "S-1-1", required_qty: 1, picked_qty: 1, shortage_qty: 0, unresolved_qty: 0 },
      { order_id: 2, order_number: "2", order_item_id: 12, basket_label: "S-1-2", required_qty: 1, picked_qty: 1, shortage_qty: 0, unresolved_qty: 0 },
      { order_id: 3, order_number: "3", order_item_id: 13, basket_label: "S-1-3", required_qty: 2, picked_qty: 2, shortage_qty: 0, unresolved_qty: 0 },
      { order_id: 4, order_number: "4", order_item_id: 14, basket_label: "S-1-4", required_qty: 8, picked_qty: 4, shortage_qty: 4, unresolved_qty: 0 },
      { order_id: 5, order_number: "5", order_item_id: 15, basket_label: "S-1-5", required_qty: 8, picked_qty: 0, shortage_qty: 8, unresolved_qty: 0 },
    ];
    const s = summarizeProductShortageAllocations(rows, 12);
    expect(s.shortageUnits).toBe(12);
    expect(s.ordersWithShortage).toBe(2);
    expect(s.affected.map((a) => a.order_id).sort()).toEqual([4, 5]);
    const head = shortageProductCardHeadline(s);
    expect(head.title).toMatch(/12/);
    expect(head.subtitle).toMatch(/2/);
    expect(head.subtitle).toMatch(/Z BRAKIEM/i);
  });
});
