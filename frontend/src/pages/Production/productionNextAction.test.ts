import { describe, expect, it } from "vitest";

import {
  productionOrdersSourceSummary,
  resolveProductionNextAction,
  resolveProductionSecondaryActions,
} from "./productionNextAction";

describe("resolveProductionNextAction", () => {
  it("planned ready → Wyślij do realizacji (single primary path)", () => {
    const next = resolveProductionNextAction({
      executionKind: "order",
      id: 1,
      status: "planned",
      sourceType: "MANUAL",
      hasShortages: false,
    });
    expect(next.kind).toBe("send_to_execution");
    expect(next.label).toBe("Wyślij do realizacji");
    expect(next.contextMessage).toMatch(/gotowe do realizacji/i);
  });

  it("shortages → Zobacz braki", () => {
    const next = resolveProductionNextAction({
      executionKind: "order",
      id: 1,
      status: "planned",
      hasShortages: true,
      sourceShortageQuantityTotal: 30,
      shortageComponentHint: "Komponent X",
    });
    expect(next.kind).toBe("view_shortages");
    expect(next.label).toBe("Zobacz braki");
    expect(next.contextMessage).toContain("30");
    expect(next.contextMessage).toContain("Komponent X");
  });

  it("collecting → Kontynuuj zbieranie", () => {
    const next = resolveProductionNextAction({
      executionKind: "order",
      id: 9,
      status: "collecting",
    });
    expect(next.kind).toBe("continue_collecting");
    expect(next.label).toBe("Kontynuuj zbieranie");
  });

  it("in_progress → Kontynuuj produkcję with progress copy", () => {
    const next = resolveProductionNextAction({
      executionKind: "order",
      id: 9,
      status: "in_progress",
      producedQuantity: 6,
      plannedQuantity: 10,
    });
    expect(next.kind).toBe("continue_production");
    expect(next.label).toBe("Kontynuuj produkcję");
    expect(next.contextMessage).toContain("6");
    expect(next.contextMessage).toContain("10");
  });

  it("awaiting_putaway → Rozlokuj", () => {
    const next = resolveProductionNextAction({
      executionKind: "batch",
      id: 3,
      status: "awaiting_putaway",
    });
    expect(next.kind).toBe("putaway");
    expect(next.label).toBe("Rozlokuj");
  });

  it("ORDERS completed → packing CTA", () => {
    const next = resolveProductionNextAction({
      executionKind: "order",
      id: 4,
      status: "completed",
      sourceType: "ORDERS",
      sourceFulfilledOrderCount: 2,
    });
    expect(next.kind).toBe("go_packing");
    expect(next.label).toBe("Przejdź do pakowania");
  });

  it("PRINT planned → Wydrukuj i rozpocznij", () => {
    const next = resolveProductionNextAction({
      executionKind: "order",
      id: 5,
      status: "planned",
      sourceType: "ORDERS",
      productionExecutionMethod: "PRINT",
      materialsReserved: true,
    });
    expect(next.kind).toBe("start_print_execution");
    expect(next.label).toBe("Wydrukuj i rozpocznij");
  });

  it("paper start is secondary, not competing primary", () => {
    const input = {
      executionKind: "order" as const,
      id: 1,
      status: "planned",
      sourceType: "MANUAL",
      hasShortages: false,
    };
    const primary = resolveProductionNextAction(input);
    const secondary = resolveProductionSecondaryActions(input, primary);
    expect(primary.kind).toBe("send_to_execution");
    expect(secondary.some((a) => a.id === "start_paper")).toBe(true);
    expect(secondary.some((a) => a.id === "print_card")).toBe(true);
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
