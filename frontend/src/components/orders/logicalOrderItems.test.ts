import { describe, expect, it } from "vitest";
import { buildLogicalOrderItemGroups, pickCanonicalOrderItemId, resolveLineageRootId } from "./logicalOrderItems";
import type { LogicalOrderItemMember } from "./logicalOrderItems";

describe("logicalOrderItems", () => {
  const wms = new Map<number, { oms_line_status?: string | null; replaced_from_order_item_id?: number | null }>();

  it("groups REPLACED source with substitute successor into one lineage", () => {
    const items: LogicalOrderItemMember[] = [
      { id: 100, quantity: 0, oms_line_status: "REPLACED", product: { name: "Stary" } },
      { id: 101, quantity: 2, product: { name: "Nowy" } },
    ];
    wms.set(100, { oms_line_status: "REPLACED" });
    wms.set(101, { oms_line_status: "TO_PICK", replaced_from_order_item_id: 100 });
    const groups = buildLogicalOrderItemGroups({ items, wmsByItemId: wms as never, panelHistory: [] });
    expect(groups).toHaveLength(1);
    expect(groups[0].lineageRootId).toBe(100);
    expect(groups[0].canonicalOrderItemId).toBe(101);
    expect(groups[0].memberOrderItemIds.sort()).toEqual([100, 101]);
    expect(groups[0].timeline.some((e) => e.kind === "replacement")).toBe(true);
  });

  it("resolveLineageRootId walks replaced_from chain", () => {
    const items = new Map<number, LogicalOrderItemMember>([
      [200, { id: 200, quantity: 1 }],
      [201, { id: 201, quantity: 1, replaced_from_order_item_id: 200 }],
    ]);
    wms.set(201, { replaced_from_order_item_id: 200 });
    expect(resolveLineageRootId(201, items, wms as never)).toBe(200);
    expect(pickCanonicalOrderItemId([200, 201], items, wms as never)).toBe(201);
  });
});
