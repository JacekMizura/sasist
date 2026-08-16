import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigateFunction } from "react-router-dom";
import type { ProductionOrderRead } from "@/api/productionApi";
import { handleProductionPackingHandoff } from "./handleProductionPackingHandoff";

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

function orderWithAuto(printCount: number): ProductionOrderRead {
  return {
    packing_handoff: {
      after_production_action: "OPEN_PACKING",
      newly_ready_orders: [{ order_id: 1, order_number: "100" }],
      auto_pack: {
        attempted: true,
        succeeded: true,
        waybill_print_count: printCount,
        waybill_file_urls: printCount > 0 ? ["/files/l.pdf"] : ["/files/l.pdf"],
        orders: [
          {
            order_id: 1,
            order_number: "100",
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

describe("handleProductionPackingHandoff print_label settings", () => {
  const navigate = vi.fn() as unknown as NavigateFunction;

  beforeEach(() => {
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
