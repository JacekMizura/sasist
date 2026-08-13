import { describe, expect, it } from "vitest";

import { resolveProductionNextAction } from "./productionNextAction";

describe("resolveProductionNextAction adapter", () => {
  it("delegates to operational state", () => {
    const next = resolveProductionNextAction({
      executionKind: "batch",
      id: 1,
      status: "awaiting_putaway",
      producedQuantity: 10,
      plannedQuantity: 10,
    });
    expect(next.kind).toBe("putaway");
    expect(next.label).toBe("Rozlokuj");
    expect(next.contextMessage).toMatch(/magazynie/i);
  });
});
