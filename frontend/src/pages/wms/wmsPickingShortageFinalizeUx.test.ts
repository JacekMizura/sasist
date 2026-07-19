import { describe, expect, it, vi } from "vitest";
import { createRequestDeduper } from "../../utils/wmsRequestDeduper";
import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import { applyWmsPickingShortageToDetail, wmsPickingRemainingQty } from "./wmsPickingUiGates";

describe("createRequestDeduper force", () => {
  it("does not join an in-flight pre-mutation GET when force=true", async () => {
    const dedupe = createRequestDeduper();
    let resolveSlow!: (v: string) => void;
    const slow = new Promise<string>((r) => {
      resolveSlow = r;
    });
    const p1 = dedupe("k", () => slow);
    const fastFn = vi.fn(async () => "fresh");
    const p2 = dedupe("k", fastFn, { force: true });
    await expect(p2).resolves.toBe("fresh");
    expect(fastFn).toHaveBeenCalledTimes(1);
    resolveSlow("stale");
    await expect(p1).resolves.toBe("stale");
  });
});

describe("shortage once → detail remaining 0", () => {
  it("one optimistic apply reaches remaining 0 without second submit", () => {
    const detail = {
      product_id: 1,
      name: "X",
      total_quantity: 1,
      picked_quantity: 0,
      missing_quantity: 0,
      remaining_to_pick: 1,
      resolution_status: "ACTIVE" as const,
      completed: false,
      orders: [{ order_id: 1, order_number: "1", quantity: 1, picked_quantity: 0, missing_quantity: 0 }],
      locations: [],
    };
    const next = applyWmsPickingShortageToDetail(detail as never, 1);
    expect(wmsPickingRemainingQty(next)).toBe(0);
    expect(next.missing_quantity).toBe(1);
    expect(next.resolution_status).toBe("SHORTAGE");
  });
});

describe("finalize operator error UX", () => {
  it("strips raw ForeignKeyViolation and keeps request_id", () => {
    const msg = extractApiErrorMessage(
      {
        response: {
          data: {
            detail: {
              message:
                "Nie udało się domknąć zbierania zamówienia #1198: (psycopg2.errors.ForeignKeyViolation) UPDATE ...",
              error:
                "Nie udało się domknąć zbierania zamówienia #1198: (psycopg2.errors.ForeignKeyViolation) UPDATE ...",
              code: "apply_order_state_failed",
              request_id: "abc-123",
            },
          },
        },
      },
      "Nie udało się zakończyć zbierania z powodu niespójności danych zamówienia. Sesja nie została zakończona.",
    );
    expect(msg.toLowerCase()).not.toContain("psycopg");
    expect(msg.toLowerCase()).not.toContain("foreignkey");
    expect(msg).toContain("ref: abc-123");
    expect(msg.toLowerCase()).toContain("niespójności danych");
  });

  it("shows safe backend message with request_id", () => {
    const msg = extractApiErrorMessage(
      {
        response: {
          data: {
            detail: {
              message:
                "Nie udało się zakończyć zbierania z powodu niespójności danych zamówienia. Sesja nie została zakończona.",
              code: "apply_order_state_failed",
              request_id: "rid-9",
            },
          },
        },
      },
      "fallback",
    );
    expect(msg).toContain("Sesja nie została zakończona");
    expect(msg).toContain("ref: rid-9");
  });
});
