import { describe, expect, it } from "vitest";

import type { WmsPackingOrderDetailApi } from "../../../../api/wmsPackingApi";
import {
  buildAutoActionDisplaySteps,
  enabledAutoActionMetas,
  isPackingCashOnDelivery,
} from "./autoActionsModel";

function detail(partial: Partial<WmsPackingOrderDetailApi> = {}): WmsPackingOrderDetailApi {
  return {
    order_id: 1,
    number: "111354",
    lines: [],
    packed_quantity: 1,
    total_quantity: 1,
    ...partial,
  } as WmsPackingOrderDetailApi;
}

describe("autoActionsModel", () => {
  it("filters steps by enabled auto_actions", () => {
    const metas = enabledAutoActionMetas({
      create_document: true,
      generate_shipment: false,
      print_document: false,
      print_label: false,
      change_order_status: true,
    });
    expect(metas.map((m) => m.key)).toEqual(["create_document", "change_order_status"]);
  });

  it("maps pipeline success/error and hides disabled actions", () => {
    const steps = buildAutoActionDisplaySteps({
      detail: detail({ wms_packing_automation_finished_at: "2026-08-09T12:00:00Z" }),
      autoActions: {
        create_document: true,
        generate_shipment: true,
        print_document: false,
        print_label: false,
        change_order_status: false,
      },
      pipeline: [
        { step: "create_document", ok: true, skipped: false, message: null },
        { step: "generate_shipment", ok: false, skipped: false, message: "fail" },
      ],
    });
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ key: "create_document", state: "SUCCESS" });
    expect(steps[1]).toMatchObject({ key: "generate_shipment", state: "ERROR", message: "fail" });
  });

  it("marks running index during finish animation", () => {
    const steps = buildAutoActionDisplaySteps({
      detail: detail(),
      autoActions: {
        create_document: true,
        generate_shipment: true,
        print_document: false,
        print_label: false,
        change_order_status: true,
      },
      runningIndex: 1,
    });
    expect(steps.map((s) => s.state)).toEqual(["SUCCESS", "RUNNING", "PENDING"]);
  });

  it("detects COD payment", () => {
    expect(isPackingCashOnDelivery(detail({ payment_method_text: "Pobranie" }))).toBe(true);
    expect(isPackingCashOnDelivery(detail({ payment_method_text: "Przelew" }))).toBe(false);
  });
});
