/**
 * Pakowanie — state machine helpers (CASE 5/6/10).
 */
import { describe, expect, it } from "vitest";
import type { WmsPackingOrderDetailApi } from "../../../api/wmsPackingApi";
import {
  decideListScanBootstrapUi,
  isPackingOrderLinesFullyPacked,
  isPackingPhysicallyComplete,
  isPackingSessionFinished,
  lineQuantityRequired,
} from "./packingHelpers";

function detail(partial: Partial<WmsPackingOrderDetailApi>): WmsPackingOrderDetailApi {
  return {
    order_id: 1226,
    number: "#1226",
    packed_quantity: 0,
    total_quantity: 1,
    lines: [
      {
        order_item_id: 1,
        product_id: 10,
        quantity: 1,
        quantity_required: 1,
        quantity_packed: 0,
        product_name: "Sznurówadła CAT 120 cm",
        ean: "5905450181192",
      },
    ],
    customer_name: "Test",
    payment_label: null,
    current_line: null,
    ...partial,
  } as WmsPackingOrderDetailApi;
}

describe("packingHelpers session finished gate", () => {
  it("CASE 5: packed 0/1 + packed_at alone must NOT be FINALIZED", () => {
    const d = detail({
      packed_quantity: 0,
      total_quantity: 1,
      wms_packing_finished_at: "2026-07-15T12:00:00Z",
      wms_packing_automation_finished_at: null,
      lines: [
        {
          order_item_id: 1,
          product_id: 10,
          quantity: 1,
          quantity_required: 1,
          quantity_packed: 0,
          product_name: "CAT",
          ean: "5905450181192",
        },
      ],
    });
    expect(isPackingOrderLinesFullyPacked(d)).toBe(false);
    expect(isPackingSessionFinished(d)).toBe(false);
  });

  it("CASE 10: automation finished + 1/1 → FINALIZED", () => {
    const d = detail({
      packed_quantity: 1,
      total_quantity: 1,
      wms_packing_finished_at: "2026-07-15T12:00:00Z",
      wms_packing_automation_finished_at: "2026-07-15T12:01:00Z",
      lines: [
        {
          order_item_id: 1,
          product_id: 10,
          quantity: 1,
          quantity_required: 1,
          quantity_packed: 1,
          product_name: "CAT",
          ean: "5905450181192",
        },
      ],
    });
    expect(isPackingSessionFinished(d)).toBe(true);
  });

  it("list scan bootstrap 1/1: defer carton gate — show order CTA", () => {
    expect(decideListScanBootstrapUi({ fullyPacked: true })).toEqual({
      openCartonGateImmediately: false,
      openFinalizationImmediately: false,
      showProceedAfterLinesCompleteCta: true,
    });
  });

  it("list scan bootstrap partial: no carton, no CTA", () => {
    expect(decideListScanBootstrapUi({ fullyPacked: false })).toEqual({
      openCartonGateImmediately: false,
      openFinalizationImmediately: false,
      showProceedAfterLinesCompleteCta: false,
    });
  });

  it("CASE 6: list/detail use same required vs packed semantics", () => {
    const line = {
      order_item_id: 1,
      product_id: 10,
      quantity: 3,
      quantity_required: 2,
      quantity_packed: 1,
      product_name: "X",
      ean: null,
    };
    expect(lineQuantityRequired(line)).toBe(2);
    const d = detail({
      packed_quantity: 1,
      total_quantity: 2,
      lines: [line],
    });
    expect(isPackingOrderLinesFullyPacked(d)).toBe(false);
    expect(isPackingPhysicallyComplete(d)).toBe(false);
  });

  it("CASE 2: multi partial never session-finished", () => {
    const d = detail({
      packed_quantity: 1,
      total_quantity: 3,
      wms_packing_automation_finished_at: null,
      lines: [
        {
          order_item_id: 1,
          product_id: 1,
          quantity: 1,
          quantity_required: 1,
          quantity_packed: 1,
          product_name: "A",
          ean: null,
        },
        {
          order_item_id: 2,
          product_id: 2,
          quantity: 2,
          quantity_required: 2,
          quantity_packed: 0,
          product_name: "B",
          ean: null,
        },
      ],
    });
    expect(isPackingOrderLinesFullyPacked(d)).toBe(false);
    expect(isPackingSessionFinished(d)).toBe(false);
  });
});
