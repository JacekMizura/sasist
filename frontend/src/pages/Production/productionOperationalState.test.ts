import { describe, expect, it } from "vitest";

import {
  formatShortageDescription,
  getProductionOperationalState,
  productionEntityDetailHref,
  productionOrdersSourceSummary,
  shouldShowProductionOrderOnActiveList,
  shortageHintFromOrderLines,
} from "./productionOperationalState";

describe("getProductionOperationalState", () => {
  it("maps shortages to WAITING_MATERIALS / reaction with concrete component copy", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 1,
      status: "planned",
      hasShortages: true,
      sourceShortageQuantityTotal: 30,
      shortageComponentHint: "Sznurowadła CAT 150 cm",
      shortagePrimaryMissingQty: 30,
    });
    expect(s.currentStep).toBe("WAITING_MATERIALS");
    expect(s.dashboardBucket).toBe("reaction");
    expect(s.businessLabel).toBe("Brakuje materiałów");
    expect(s.description).toBe("Brakuje 30 szt. — Sznurowadła CAT 150 cm");
    expect(s.primaryAction.label).toBe("Zobacz braki");
  });

  it("appends + N kolejnych when multiple component shortages", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 1,
      status: "planned",
      hasShortages: true,
      shortageComponentHint: "Sznurowadła CAT 150 cm",
      shortagePrimaryMissingQty: 30,
      shortageAdditionalCount: 2,
    });
    expect(s.description).toBe("Brakuje 30 szt. — Sznurowadła CAT 150 cm + 2 kolejnych");
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

  it("ORDERS completed + awaiting packing → READY_TO_PACK and skipsPutaway", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 4,
      status: "completed",
      sourceType: "ORDERS",
      sourceFulfilledOrderCount: 2,
      sourceAwaitingPackingOrderCount: 2,
      plannedQuantity: 5,
      producedQuantity: 5,
    });
    expect(s.currentStep).toBe("READY_TO_PACK");
    expect(s.skipsPutaway).toBe(true);
    expect(s.dashboardBucket).toBe("todo");
    expect(s.businessLabel).toBe("Gotowe do pakowania");
    expect(s.primaryAction.kind).toBe("go_packing");
    expect(s.primaryAction.label).toBe("Przejdź do pakowania");
  });

  it("ORDERS completed + fulfilled but all packed/shipped → COMPLETED, no packing CTA", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 3,
      status: "completed",
      sourceType: "ORDERS",
      sourceFulfilledOrderCount: 1,
      sourceAwaitingPackingOrderCount: 0,
      plannedQuantity: 20,
      producedQuantity: 20,
    });
    expect(s.currentStep).toBe("COMPLETED");
    expect(s.dashboardBucket).toBe("done");
    expect(s.primaryAction.kind).not.toBe("go_packing");
    expect(s.businessLabel).toBe("Zakończone");
  });

  it("ORDERS completed mixed sources: one DONE + one awaiting → READY_TO_PACK", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 5,
      status: "completed",
      sourceType: "ORDERS",
      sourceFulfilledOrderCount: 2,
      sourceAwaitingPackingOrderCount: 1,
      plannedQuantity: 10,
      producedQuantity: 10,
    });
    expect(s.currentStep).toBe("READY_TO_PACK");
    expect(s.dashboardBucket).toBe("todo");
    expect(s.primaryAction.kind).toBe("go_packing");
  });

  it("MANUAL completed is COMPLETED / done — not packing", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 9,
      status: "completed",
      sourceType: "MANUAL",
      sourceFulfilledOrderCount: 0,
      plannedQuantity: 3,
      producedQuantity: 3,
    });
    expect(s.currentStep).toBe("COMPLETED");
    expect(s.dashboardBucket).toBe("done");
    expect(s.primaryAction.kind).not.toBe("go_packing");
    expect(s.primaryAction.kind).toBe("view_details");
    expect(s.primaryAction.href).toBe("/produkcja/zlecenia/9");
  });

  it("PLANNING completed is COMPLETED / done — not packing", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 10,
      status: "completed",
      sourceType: "PLANNING",
      plannedQuantity: 3,
      producedQuantity: 3,
    });
    expect(s.currentStep).toBe("COMPLETED");
    expect(s.dashboardBucket).toBe("done");
    expect(s.primaryAction.kind).toBe("view_details");
    expect(s.primaryAction.href).toBe("/produkcja/zlecenia/10");
  });

  it("completed batch links to BAT detail, never MO path", () => {
    const s = getProductionOperationalState({
      executionKind: "batch",
      id: 16,
      status: "completed",
      producedQuantity: 26,
      plannedQuantity: 26,
    });
    expect(s.currentStep).toBe("COMPLETED");
    expect(s.description).toMatch(/Partia produkcyjna/i);
    expect(s.primaryAction.kind).toBe("view_details");
    expect(s.primaryAction.label).toBe("Zobacz szczegóły");
    expect(s.primaryAction.href).toBe("/produkcja/serie/16");
    expect(s.primaryAction.href).not.toMatch(/\/zlecenia\//);
  });

  it("completed batch on detail page has no dead Zobacz szczegóły CTA", () => {
    const s = getProductionOperationalState({
      executionKind: "batch",
      id: 16,
      status: "completed",
      isOnEntityDetailPage: true,
    });
    expect(s.primaryAction.kind).toBe("none");
    expect(s.primaryAction.href).toBeUndefined();
  });

  it("completed MANUAL/PLANNING on detail page suppress view_details; ORDERS packing stays", () => {
    expect(
      getProductionOperationalState({
        executionKind: "order",
        id: 9,
        status: "completed",
        sourceType: "MANUAL",
        isOnEntityDetailPage: true,
      }).primaryAction.kind,
    ).toBe("none");
    expect(
      getProductionOperationalState({
        executionKind: "order",
        id: 4,
        status: "completed",
        sourceType: "ORDERS",
        sourceFulfilledOrderCount: 2,
        sourceAwaitingPackingOrderCount: 2,
        isOnEntityDetailPage: true,
      }).primaryAction.kind,
    ).toBe("go_packing");
    expect(
      getProductionOperationalState({
        executionKind: "order",
        id: 3,
        status: "completed",
        sourceType: "ORDERS",
        sourceFulfilledOrderCount: 1,
        sourceAwaitingPackingOrderCount: 0,
        isOnEntityDetailPage: true,
      }).primaryAction.kind,
    ).not.toBe("go_packing");
  });

  it("productionEntityDetailHref separates batch vs order", () => {
    expect(productionEntityDetailHref({ executionKind: "batch", id: 16 })).toBe("/produkcja/serie/16");
    expect(productionEntityDetailHref({ executionKind: "order", id: 4 })).toBe("/produkcja/zlecenia/4");
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

  it("planned before release → Przekaż do realizacji / Wyślij do realizacji", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 1,
      status: "planned",
      sourceType: "MANUAL",
      isReleasedToWms: false,
    });
    expect(s.currentStep).toBe("READY_TO_START");
    expect(s.dashboardBucket).toBe("todo");
    expect(s.businessLabel).toBe("Przekaż do realizacji");
    expect(s.description).toMatch(/przekazane do realizacji/i);
    expect(s.primaryAction.kind).toBe("send_to_execution");
    expect(s.primaryAction.label).toBe("Wyślij do realizacji");
  });

  it("planned after release → Pobierz komponenty / Zbieraj", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 1,
      status: "planned",
      sourceType: "MANUAL",
      isReleasedToWms: true,
    });
    expect(s.currentStep).toBe("READY_TO_START");
    expect(s.businessLabel).toBe("Pobierz komponenty");
    expect(s.description).toMatch(/pobranie komponentów/i);
    expect(s.primaryAction.kind).toBe("start_collecting");
    expect(s.primaryAction.label).toBe("Zbieraj");
  });

  it("collecting keeps Pobierz komponenty / Kontynuuj", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 1,
      status: "collecting",
    });
    expect(s.businessLabel).toBe("Pobierz komponenty");
    expect(s.primaryAction.label).toBe("Kontynuuj");
  });

  it("delayed planned without shortages → same stage + Opóźnione flag", () => {
    const s = getProductionOperationalState({
      executionKind: "batch",
      id: 1,
      status: "planned",
      plannedDate: "2020-01-01",
    });
    expect(s.isDelayed).toBe(true);
    expect(s.dashboardBucket).toBe("reaction");
    expect(s.businessLabel).toBe("Przekaż do realizacji");
    expect(s.primaryAction.label).toBe("Wyślij do realizacji");
  });

  it("same plannedDate yields identical stage on pulp and orders path", () => {
    const input = {
      executionKind: "batch" as const,
      id: 10,
      status: "planned",
      plannedDate: "2020-01-01",
      hasShortages: false,
    };
    const a = getProductionOperationalState(input);
    const b = getProductionOperationalState(input);
    expect(a.businessLabel).toBe(b.businessLabel);
    expect(a.businessLabel).toBe("Przekaż do realizacji");
    expect(a.isDelayed).toBe(true);
  });
});

describe("shouldShowProductionOrderOnActiveList", () => {
  it("A: completed ORDERS + fulfilled + awaiting packing → active", () => {
    expect(
      shouldShowProductionOrderOnActiveList({
        status: "completed",
        source_type: "ORDERS",
        source_fulfilled_order_count: 1,
        source_awaiting_packing_order_count: 1,
      }),
    ).toBe(true);
  });

  it("B: completed ORDERS + fulfilled + all DONE/SHIPPED → hidden", () => {
    expect(
      shouldShowProductionOrderOnActiveList({
        status: "completed",
        source_type: "ORDERS",
        source_fulfilled_order_count: 1,
        source_awaiting_packing_order_count: 0,
      }),
    ).toBe(false);
  });

  it("C: mixed sources — one DONE + one awaiting → still active", () => {
    expect(
      shouldShowProductionOrderOnActiveList({
        status: "completed",
        source_type: "ORDERS",
        source_fulfilled_order_count: 2,
        source_awaiting_packing_order_count: 1,
      }),
    ).toBe(true);
  });

  it("D: all source orders DONE → card disappears", () => {
    expect(
      shouldShowProductionOrderOnActiveList({
        status: "completed",
        source_type: "ORDERS",
        source_fulfilled_order_count: 2,
        source_awaiting_packing_order_count: 0,
      }),
    ).toBe(false);
  });

  it("hides completed MANUAL / PLANNING", () => {
    expect(
      shouldShowProductionOrderOnActiveList({
        status: "completed",
        source_type: "MANUAL",
        source_fulfilled_order_count: 0,
      }),
    ).toBe(false);
    expect(
      shouldShowProductionOrderOnActiveList({
        status: "completed",
        source_type: "PLANNING",
      }),
    ).toBe(false);
  });

  it("fulfilled alone is not enough for active ORDERS card", () => {
    expect(
      shouldShowProductionOrderOnActiveList({
        status: "completed",
        source_type: "ORDERS",
        source_fulfilled_order_count: 2,
        source_awaiting_packing_order_count: 0,
      }),
    ).toBe(false);
  });

  it("keeps active non-completed orders", () => {
    expect(shouldShowProductionOrderOnActiveList({ status: "planned", source_type: "MANUAL" })).toBe(true);
    expect(shouldShowProductionOrderOnActiveList({ status: "cancelled" })).toBe(false);
  });
});

describe("shortageHintFromOrderLines / formatShortageDescription", () => {
  it("picks largest missing component and counts extras", () => {
    const hint = shortageHintFromOrderLines([
      { product_name_snapshot: "A", missing: 5 },
      { product_name_snapshot: "Sznurowadła CAT 150 cm", missing: 30 },
      { product_name_snapshot: "B", missing: 2 },
    ]);
    expect(hint.hint).toBe("Sznurowadła CAT 150 cm");
    expect(hint.primaryMissingQty).toBe(30);
    expect(hint.additionalCount).toBe(2);
    expect(
      formatShortageDescription({
        shortageComponentHint: hint.hint,
        shortagePrimaryMissingQty: hint.primaryMissingQty,
        shortageAdditionalCount: hint.additionalCount,
      }),
    ).toBe("Brakuje 30 szt. — Sznurowadła CAT 150 cm + 2 kolejnych");
  });
});

describe("productionOrdersSourceSummary", () => {
  it("formats orders demand summary", () => {
    expect(
      productionOrdersSourceSummary({
        sourceOrderCount: 3,
        sourceRequestedQuantityTotal: 12,
        plannedQuantity: 12,
      }),
    ).toMatch(/3/);
  });
});
