import { describe, expect, it } from "vitest";

import { computeLineMaterialStatuses } from "./batchLineMaterialStatus";

describe("computeLineMaterialStatuses", () => {
  it("marks single line available when aggregate has no missing", () => {
    const statuses = computeLineMaterialStatuses(
      [{ key: "a", compositionId: 1, plannedQuantity: 7 }],
      { 1: [{ componentProductId: 10, requiredPerUnit: 1 }] },
      [{ component_product_id: 10, required: 7, available: 20, missing: 0 }],
    );
    expect(statuses.a.ok).toBe(true);
    expect(statuses.a.label).toBe("Materiały: Dostępne");
  });

  it("marks single line short from aggregate missing without BOM", () => {
    const statuses = computeLineMaterialStatuses(
      [{ key: "a", compositionId: 1, plannedQuantity: 7 }],
      {},
      [{ component_product_id: 10, required: 7, available: 1, missing: 6 }],
    );
    expect(statuses.a.ok).toBe(false);
    expect(statuses.a.missingQty).toBe(6);
    expect(statuses.a.label).toContain("Brak");
  });

  it("does not show both lines OK when they share a short component", () => {
    // A needs 6, B needs 5, stock 8 → missing 3; both must be short.
    const statuses = computeLineMaterialStatuses(
      [
        { key: "a", compositionId: 1, plannedQuantity: 1 },
        { key: "b", compositionId: 2, plannedQuantity: 1 },
      ],
      {
        1: [{ componentProductId: 99, requiredPerUnit: 6 }],
        2: [{ componentProductId: 99, requiredPerUnit: 5 }],
      },
      [{ component_product_id: 99, required: 11, available: 8, missing: 3 }],
    );
    expect(statuses.a.ok).toBe(false);
    expect(statuses.b.ok).toBe(false);
    expect(statuses.a.missingQty + statuses.b.missingQty).toBeCloseTo(3, 5);
  });

  it("keeps unaffected line OK when shortage is on another component", () => {
    const statuses = computeLineMaterialStatuses(
      [
        { key: "a", compositionId: 1, plannedQuantity: 2 },
        { key: "b", compositionId: 2, plannedQuantity: 2 },
      ],
      {
        1: [{ componentProductId: 10, requiredPerUnit: 1 }],
        2: [{ componentProductId: 20, requiredPerUnit: 1 }],
      },
      [
        { component_product_id: 10, required: 2, available: 100, missing: 0 },
        { component_product_id: 20, required: 2, available: 0, missing: 2 },
      ],
    );
    expect(statuses.a.ok).toBe(true);
    expect(statuses.b.ok).toBe(false);
    expect(statuses.b.missingQty).toBeCloseTo(2, 5);
  });

  it("recomputes proportional share when quantity changes", () => {
    const bom = {
      1: [{ componentProductId: 99, requiredPerUnit: 2 }],
      2: [{ componentProductId: 99, requiredPerUnit: 2 }],
    };
    const before = computeLineMaterialStatuses(
      [
        { key: "a", compositionId: 1, plannedQuantity: 1 },
        { key: "b", compositionId: 2, plannedQuantity: 1 },
      ],
      bom,
      [{ component_product_id: 99, required: 4, available: 4, missing: 0 }],
    );
    expect(before.a.ok).toBe(true);
    expect(before.b.ok).toBe(true);

    const after = computeLineMaterialStatuses(
      [
        { key: "a", compositionId: 1, plannedQuantity: 3 },
        { key: "b", compositionId: 2, plannedQuantity: 1 },
      ],
      bom,
      [{ component_product_id: 99, required: 8, available: 4, missing: 4 }],
    );
    expect(after.a.ok).toBe(false);
    expect(after.b.ok).toBe(false);
    expect(after.a.missingQty).toBeCloseTo(3, 5); // (6/8)*4
    expect(after.b.missingQty).toBeCloseTo(1, 5); // (2/8)*4
  });
});
