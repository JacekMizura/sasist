import { describe, expect, it } from "vitest";

import {
  legacyReceivingToWarehouseStatus,
  purchaseWorkflowStatusLabelPl,
  resolveWarehouseWorkflowStatus,
  warehouseWorkflowStatusLabelPl,
} from "./pzWorkflowStatusPresentation";

describe("resolveWarehouseWorkflowStatus", () => {
  it("uses API warehouse_workflow_status when present", () => {
    expect(resolveWarehouseWorkflowStatus("PUTAWAY_IN_PROGRESS", {})).toBe("PUTAWAY_IN_PROGRESS");
  });

  it("maps legacy IN_PROGRESS to COUNTING", () => {
    expect(legacyReceivingToWarehouseStatus("IN_PROGRESS")).toBe("COUNTING");
    expect(
      resolveWarehouseWorkflowStatus(undefined, { receiving_status: "IN_PROGRESS" }),
    ).toBe("COUNTING");
  });

  it("maps legacy DONE to COUNTED when no putaway", () => {
    expect(
      resolveWarehouseWorkflowStatus(undefined, {
        receiving_status: "DONE",
        putaway_status: "NOT_STARTED",
      }),
    ).toBe("COUNTED");
  });
});

describe("status labels PL", () => {
  it("warehouse labels", () => {
    expect(warehouseWorkflowStatusLabelPl("COUNTING")).toBe("Liczenie");
    expect(warehouseWorkflowStatusLabelPl("PUTAWAY_COMPLETED")).toBe("Rozlokowane");
  });

  it("purchase labels", () => {
    expect(purchaseWorkflowStatusLabelPl("PENDING_INVOICE")).toBe("Oczekuje FV");
    expect(purchaseWorkflowStatusLabelPl("VERIFIED")).toBe("Zweryfikowane");
  });
});
