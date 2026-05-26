import { describe, expect, it } from "vitest";
import {
  findOrderItemForMenuAction,
  orderLineItemId,
  orderLineMenuLockedMessage,
} from "./orderLineMenuAction";

describe("orderLineMenuAction", () => {
  it("parses string ids from summary items", () => {
    expect(orderLineItemId({ id: "42" })).toBe(42);
    expect(orderLineItemId({ id: undefined })).toBeNull();
  });

  it("finds order item with numeric coercion", () => {
    const items = [{ id: 10, oms_line_status: null }];
    expect(findOrderItemForMenuAction(items, { id: 10, quantity: 1 })).toEqual(items[0]);
    expect(findOrderItemForMenuAction(items, { id: "10" as unknown as number, quantity: 1 })).toEqual(items[0]);
  });

  it("locks archived and resolved-shortage lines", () => {
    expect(orderLineMenuLockedMessage({ oms_line_status: "REPLACED" })).toMatch(/archiwalnej/i);
    expect(orderLineMenuLockedMessage({ oms_line_status: "TO_PICK" }, { resolvedShortageRemoved: true })).toMatch(
      /rozwiązanie braku/i,
    );
    expect(orderLineMenuLockedMessage({ oms_line_status: "TO_PICK" })).toBeNull();
  });
});
