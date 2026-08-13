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
    expect(s.businessLabel).toBe("Gotowe do pakowania");
    expect(s.primaryAction.kind).toBe("go_packing");
    expect(s.primaryAction.label).toBe("Przejdź do pakowania");
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
    expect(s.primaryAction.href).toBe("/production/orders/9");
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
    expect(s.primaryAction.href).toBe("/production/orders/10");
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
    expect(s.primaryAction.href).toBe("/production/batch/16");
    expect(s.primaryAction.href).not.toMatch(/\/orders\//);
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
        isOnEntityDetailPage: true,
      }).primaryAction.kind,
    ).toBe("go_packing");
  });

  it("productionEntityDetailHref separates batch vs order", () => {
    expect(productionEntityDetailHref({ executionKind: "batch", id: 16 })).toBe("/production/batch/16");
    expect(productionEntityDetailHref({ executionKind: "order", id: 4 })).toBe("/production/orders/4");
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

  it("planned after release → Pobierz komponenty / Rozpocznij zbieranie", () => {
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
    expect(s.primaryAction.label).toBe("Rozpocznij zbieranie");
  });

  it("collecting keeps Pobierz komponenty / Kontynuuj zbieranie", () => {
    const s = getProductionOperationalState({
      executionKind: "order",
      id: 1,
      status: "collecting",
    });
    expect(s.businessLabel).toBe("Pobierz komponenty");
    expect(s.primaryAction.label).toBe("Kontynuuj zbieranie");
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

describe("shouldShowProductionOrderOnActiveList", () => {
  it("keeps completed ORDERS with fulfilled sources (READY_TO_PACK)", () => {
    expect(
      shouldShowProductionOrderOnActiveList({
        status: "completed",
        source_type: "ORDERS",
        source_fulfilled_order_count: 2,
      }),
    ).toBe(true);
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

  it("hides completed ORDERS without fulfilled sources", () => {
    expect(
      shouldShowProductionOrderOnActiveList({
        status: "completed",
        source_type: "ORDERS",
        source_fulfilled_order_count: 0,
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
