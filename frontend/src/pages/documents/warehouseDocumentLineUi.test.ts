import { describe, expect, it } from "vitest";

import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
import { receiptLineLocationCode, receiptLinePlacementRows } from "./warehouseDocumentLineUi";

function line(partial: Partial<StockDocumentItemRead>): StockDocumentItemRead {
  return {
    id: 1,
    ordered_quantity: 18,
    received_quantity: 18,
    quantity: 18,
    difference: 0,
    value_net: null,
    vat_rate: 23,
    ...partial,
  } as StockDocumentItemRead;
}

describe("receiptLinePlacementRows", () => {
  it("A: single putaway location with qty", () => {
    const rows = receiptLinePlacementRows(
      line({
        quantity_putaway: 18,
        putaway_remaining: 0,
        putaway_allocations: [
          {
            location_id: 11,
            location_code: "A11-C-1",
            location_type: "PICK",
            quantity: 18,
          },
        ],
      }),
      "DOCK-IN",
    );
    expect(rows).toEqual([
      { locationCode: "A11-C-1", locationType: "PICK", quantity: 18 },
    ]);
    expect(receiptLineLocationCode(line({
      quantity_putaway: 18,
      putaway_remaining: 0,
      putaway_allocations: [
        { location_id: 11, location_code: "A11-C-1", location_type: "PICK", quantity: 18 },
      ],
    }))).toContain("A11-C-1");
    expect(receiptLineLocationCode(line({
      quantity_putaway: 18,
      putaway_remaining: 0,
      putaway_allocations: [
        { location_id: 11, location_code: "A11-C-1", location_type: "PICK", quantity: 18 },
      ],
    }))).toContain("18");
  });

  it("B: multi location keeps all quantities", () => {
    const rows = receiptLinePlacementRows(
      line({
        quantity_putaway: 18,
        putaway_remaining: 0,
        putaway_allocations: [
          { location_id: 1, location_code: "A11-C-1", location_type: "PICK", quantity: 5 },
          { location_id: 2, location_code: "A23-A-2", location_type: "PICK", quantity: 10 },
          { location_id: 3, location_code: "REZERWA-01", location_type: "BUFFER", quantity: 3 },
        ],
      }),
      "DOCK-IN",
    );
    expect(rows.map((r) => [r.locationCode, r.quantity])).toEqual([
      ["A23-A-2", 10],
      ["A11-C-1", 5],
      ["REZERWA-01", 3],
    ]);
  });

  it("C: partial putaway shows destinations + DOCK-IN remaining", () => {
    const rows = receiptLinePlacementRows(
      line({
        quantity_putaway: 13,
        putaway_remaining: 5,
        putaway_allocations: [
          { location_id: 1, location_code: "A11-C-1", location_type: "PICK", quantity: 5 },
          { location_id: 2, location_code: "A23-A-2", location_type: "PICK", quantity: 8 },
        ],
      }),
      "DOCK-IN",
    );
    expect(rows).toEqual([
      { locationCode: "A23-A-2", locationType: "PICK", quantity: 8 },
      { locationCode: "A11-C-1", locationType: "PICK", quantity: 5 },
      { locationCode: "DOCK-IN", locationType: "INBOUND", quantity: 5, isDockRemaining: true },
    ]);
    const total = rows.reduce((s, r) => s + r.quantity, 0);
    expect(total).toBe(18);
  });

  it("D: ignores putaway_last_location alone — uses allocations provenance only", () => {
    const rows = receiptLinePlacementRows(
      line({
        quantity_putaway: 5,
        putaway_remaining: 13,
        putaway_last_location_name: "A11-C-1",
        putaway_allocations: [
          { location_id: 1, location_code: "A11-C-1", location_type: "PICK", quantity: 5 },
        ],
      }),
      "DOCK-IN",
    );
    expect(rows.find((r) => r.locationCode === "A11-C-1")?.quantity).toBe(5);
    expect(rows.find((r) => r.isDockRemaining)?.quantity).toBe(13);
  });

  it("all still on dock when no putaway yet", () => {
    const rows = receiptLinePlacementRows(
      line({
        quantity_putaway: 0,
        putaway_remaining: 18,
        putaway_allocations: [],
      }),
      "DOCK-IN",
    );
    expect(rows).toEqual([
      { locationCode: "DOCK-IN", locationType: "INBOUND", quantity: 18, isDockRemaining: true },
    ]);
  });
});
