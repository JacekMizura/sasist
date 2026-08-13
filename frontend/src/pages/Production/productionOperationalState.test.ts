import { describe, expect, it } from "vitest";

import {
  getProductionOperationalState,
  productionOrdersSourceSummary,
} from "./productionOperationalState";

describe("getProductionOperationalState", () => {
  it("maps shortages to WAITING_MATERIALS / reaction", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 1,
      status: "planned",
      hasShortages: true,
      sourceShortageQuantityTotal: 30,
      shortageComponentHint: "Komponent X",
    });
    expect(s.currentStep).toBe("WAITING_MATERIALS");
    expect(s.dashboardBucket).toBe("reaction");
    expect(s.businessLabel).toBe("Brakuje materiałów");
    expect(s.primaryAction.label).toBe("Zobacz braki");
  });

  it("awaiting_putaway is todo, not in_progress — even at 100% production", () => {
    const s = getProductionOperationalState({
      executionKind: "batch",
      id: 14,
      status: "awaiting_putaway",
      producedQuantity: 10,
      plannedQuantity: 10,
    });
    expect(s.currentStep).toBe("WAITING_PUTAWAY");
    expect(s.dashboardBucket).toBe("todo");
    expect(s.businessLabel).toBe("Rozlokuj produkt");
    expect(s.progressMeaning.percent).toBe(100);
    expect(s.progressMeaning.nextStepHint).toMatch(/Rozlokowanie/i);
    expect(s.primaryAction.label).toBe("Rozlokuj");
  });

  it("collecting / producing land only in in_progress", () => {
    expect(
      getProductionOperationalState({
        executionKind: "order",
        id: 1,
        status: "collecting",
      }).dashboardBucket,
    ).toBe("in_progress");
    expect(
      getProductionOperationalState({
        executionKind: "order",
        id: 1,
        status: "in_progress",
        producedQuantity: 6,
        plannedQuantity: 10,
      }).dashboardBucket,
    ).toBe("in_progress");
  });

  it("ORDERS completed with fulfilled → READY_TO_PACK and skipsPutaway", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 4,
      status: "completed",
      sourceType: "ORDERS",
      sourceFulfilledOrderCount: 2,
      plannedQuantity: 5,
      producedQuantity: 5,
    });
    expect(s.currentStep).toBe("READY_TO_PACK");
    expect(s.skipsPutaway).toBe(true);
    expect(s.dashboardBucket).toBe("todo");
    expect(s.primaryAction.kind).toBe("go_packing");
  });

  it("MANUAL/PLANNING after production wait for putaway", () => {
    const manual = getProductionOperationalState({
      executionKind: "order",
      id: 1,
      status: "awaiting_putaway",
      sourceType: "MANUAL",
      producedQuantity: 3,
      plannedQuantity: 3,
    });
    expect(manual.skipsPutaway).toBe(false);
    expect(manual.currentStep).toBe("WAITING_PUTAWAY");

    const planning = getProductionOperationalState({
      executionKind: "order",
      id: 2,
      status: "awaiting_putaway",
      sourceType: "PLANNING",
    });
    expect(planning.skipsPutaway).toBe(false);
  });

  it("planned ready → send to execution in todo", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 1,
      status: "planned",
      sourceType: "MANUAL",
    });
    expect(s.currentStep).toBe("READY_TO_START");
    expect(s.dashboardBucket).toBe("todo");
    expect(s.primaryAction.kind).toBe("send_to_execution");
  });

  it("delayed planned without shortages → reaction", () => {
    const s = getProductionOperationalState({
      executionKind: "batch",
      id: 1,
      status: "planned",
      plannedDate: "2020-01-01",
    });
    expect(s.isDelayed).toBe(true);
    expect(s.dashboardBucket).toBe("reaction");
    expect(s.businessLabel).toBe("Opóźnione");
  });
});

describe("productionOrdersSourceSummary", () => {
  it("formats business ORDERS summary", () => {
    expect(
      productionOrdersSourceSummary({
        sourceOrderCount: 6,
        sourceRequestedQuantityTotal: 18,
      }),
    ).toBe("6 zamówień · 18 szt.");
  });
});
