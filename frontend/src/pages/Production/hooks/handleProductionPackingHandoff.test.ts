import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigateFunction } from "react-router-dom";
import type { ProductionOrderRead } from "@/api/productionApi";
import {
  handleProductionPackingHandoff,
  resetProductionPackingHandoffHandledForTests,
  selectPackingHandoffCarrier,
} from "./handleProductionPackingHandoff";

const toastSuccess = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

const getWmsPackingSettings = vi.fn();
vi.mock("@/api/wmsPackingSettingsApi", () => ({
  getWmsPackingSettings: (...args: unknown[]) => getWmsPackingSettings(...args),
}));

const runPackingPostFinishClientActions = vi.fn(async () => undefined);
vi.mock("@/components/wms/packing/packingPostFinishClientActions", () => ({
  runPackingPostFinishClientActions: (...args: unknown[]) => runPackingPostFinishClientActions(...args),
}));

vi.mock("@/types/wmsPackingExtendedUi", () => ({
  loadWmsPackingExtendedUi: () => ({
    afterSalesDocumentAction: "print",
    afterWaybillAction: "print",
    printCopyOfSalesDoc: false,
  }),
}));

function orderWithAuto(printCount: number, moId = 26): ProductionOrderRead {
  return {
    id: moId,
    packing_handoff: {
      after_production_action: "OPEN_PACKING",
      newly_ready_orders: [{ order_id: 1258, order_number: "1258" }],
      auto_pack: {
        attempted: true,
        succeeded: true,
        waybill_print_count: printCount,
        waybill_file_urls: printCount > 0 ? ["/files/l.pdf"] : ["/files/l.pdf"],
        orders: [
          {
            order_id: 1258,
            order_number: "1258",
            ok: true,
            has_shipping_label: true,
            label_count: 1,
            waybill_print_count: printCount,
            post_pack_pipeline:
              printCount > 0
                ? [
                    {
                      step: "print_label",
                      ok: true,
                      skipped: false,
                      message: "client_print_waybill;file_url=/files/l.pdf",
                    },
                  ]
                : [{ step: "create_document", ok: true, skipped: false, message: "id=1" }],
          },
        ],
      },
    },
  } as unknown as ProductionOrderRead;
}

function orderOpenPacking(moId = 27): ProductionOrderRead {
  return {
    id: moId,
    packing_handoff: {
      after_production_action: "OPEN_PACKING",
      newly_ready_orders: [{ order_id: 1259, order_number: "1259" }],
      auto_pack: {
        attempted: true,
        succeeded: false,
        fallback_reason: "missing_shipping_label",
        waybill_print_count: 0,
        waybill_file_urls: [],
        orders: [],
      },
    },
  } as unknown as ProductionOrderRead;
}

function orderWithoutHandoff(moId = 26): ProductionOrderRead {
  return { id: moId, packing_handoff: null } as unknown as ProductionOrderRead;
}

describe("handleProductionPackingHandoff print_label settings", () => {
  const navigate = vi.fn() as unknown as NavigateFunction;

  beforeEach(() => {
    resetProductionPackingHandoffHandledForTests();
    toastSuccess.mockReset();
    getWmsPackingSettings.mockReset();
    runPackingPostFinishClientActions.mockReset();
    navigate.mockReset?.();
  });

  it("print_label OFF → toast without Wydrukowano + printLabelEnabled false", async () => {
    getWmsPackingSettings.mockResolvedValue({
      auto_actions: { print_label: false, print_document: false },
    });
    await handleProductionPackingHandoff(orderWithAuto(0), navigate, {
      tenantId: 1,
      warehouseId: 1,
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "Pakowanie zakończone automatycznie — list przewozowy był już wygenerowany.",
    );
    expect(runPackingPostFinishClientActions).toHaveBeenCalledWith(
      expect.objectContaining({ printLabelEnabled: false }),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("print_label ON → toast Wydrukowano + printLabelEnabled true", async () => {
    getWmsPackingSettings.mockResolvedValue({
      auto_actions: { print_label: true, print_document: false },
    });
    await handleProductionPackingHandoff(orderWithAuto(1), navigate, {
      tenantId: 1,
      warehouseId: 1,
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "Pakowanie zakończone automatycznie. Wydrukowano 1 list przewozowy.",
    );
    expect(runPackingPostFinishClientActions).toHaveBeenCalledWith(
      expect.objectContaining({ printLabelEnabled: true }),
    );
  });
});

describe("packing_handoff single owner + one toast", () => {
  const navigate = vi.fn() as unknown as NavigateFunction;

  beforeEach(() => {
    resetProductionPackingHandoffHandledForTests();
    toastSuccess.mockReset();
    getWmsPackingSettings.mockReset();
    getWmsPackingSettings.mockResolvedValue({
      auto_actions: { print_label: false, print_document: false },
    });
    runPackingPostFinishClientActions.mockReset();
    navigate.mockReset?.();
  });

  it("progress auto_pack success + finish without handoff → carrier is progress only", () => {
    const progress = orderWithAuto(0);
    const finish = orderWithoutHandoff();
    expect(selectPackingHandoffCarrier(progress, finish)).toBe(progress);
  });

  it("progress auto_pack success + finish without handoff → exactly 1 toast", async () => {
    const progress = orderWithAuto(0);
    const finish = orderWithoutHandoff();
    const carrier = selectPackingHandoffCarrier(progress, finish)!;
    await handleProductionPackingHandoff(carrier, navigate, { tenantId: 1, warehouseId: 1 });
    // Simulated second owner (old bug): finish also passed to handler
    await handleProductionPackingHandoff(finish, navigate, { tenantId: 1, warehouseId: 1 });
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Pakowanie zakończone automatycznie — list przewozowy był już wygenerowany.",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("fallback OPEN_PACKING → exactly 1 redirect", async () => {
    const progress = orderOpenPacking();
    const finish = orderWithoutHandoff(27);
    const carrier = selectPackingHandoffCarrier(progress, finish)!;
    const r1 = await handleProductionPackingHandoff(carrier, navigate, {
      tenantId: 1,
      warehouseId: 1,
    });
    const r2 = await handleProductionPackingHandoff(carrier, navigate, {
      tenantId: 1,
      warehouseId: 1,
    });
    expect(r1.navigatedToPacking).toBe(true);
    expect(r2.acted).toBe(false);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("/packing/"));
  });

  it("replay/render same auto_pack result → no second toast", async () => {
    const progress = orderWithAuto(0);
    await handleProductionPackingHandoff(progress, navigate, { tenantId: 1, warehouseId: 1 });
    await handleProductionPackingHandoff(progress, navigate, { tenantId: 1, warehouseId: 1 });
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(runPackingPostFinishClientActions).toHaveBeenCalledTimes(1);
  });
});
