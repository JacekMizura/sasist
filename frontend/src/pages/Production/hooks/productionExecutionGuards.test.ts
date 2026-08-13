import { describe, expect, it, vi } from "vitest";

import {
  extractApiBusinessMessage,
  formatProductionMutationError,
  ordersMoSkipsPutaway,
  withMutationLock,
} from "./productionExecutionGuards";
import { producibleQuantityHint, resolveMaterialReadiness } from "../productionUi";

function axiosError(status: number, detail: unknown) {
  return {
    response: { status, data: { detail } },
    message: `Request failed with status code ${status}`,
  };
}

describe("productionExecutionGuards", () => {
  it("extracts business detail and ignores raw axios status text", () => {
    const e = axiosError(409, "Zlecenie nie jest w produkcji.");
    expect(extractApiBusinessMessage(e)).toBe("Zlecenie nie jest w produkcji.");
    expect(formatProductionMutationError(e, "Nie można zakończyć produkcji.")).toBe(
      "Zlecenie nie jest w produkcji.",
    );
  });

  it("falls back to Polish message when only axios status text exists", () => {
    const e = { message: "Request failed with status code 500" };
    expect(formatProductionMutationError(e, "Nie udało się zapisać wyprodukowanej ilości.")).toBe(
      "Nie udało się zapisać wyprodukowanej ilości.",
    );
  });

  it("uses nested shortage message for 409", () => {
    const e = axiosError(409, {
      message: "Niewystarczający stan magazynowy składników.",
      shortages: [{ product_name: "Śruba", missing: 2 }],
    });
    const msg = formatProductionMutationError(e, "Nie można zakończyć pobierania komponentów.");
    expect(msg).toContain("Niewystarczający stan");
    expect(msg).toContain("Śruba");
  });

  it("ordersMoSkipsPutaway only for ORDERS source_type", () => {
    expect(ordersMoSkipsPutaway("ORDERS")).toBe(true);
    expect(ordersMoSkipsPutaway("orders")).toBe(true);
    expect(ordersMoSkipsPutaway("PLANNING")).toBe(false);
    expect(ordersMoSkipsPutaway("MANUAL")).toBe(false);
    expect(ordersMoSkipsPutaway(null)).toBe(false);
  });

  it("withMutationLock blocks concurrent calls and releases after error", async () => {
    const lock = { current: false };
    const setBusy = vi.fn();
    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      resolveFirst = r;
    });

    const p1 = withMutationLock(lock, setBusy, async () => {
      await firstGate;
      return "ok";
    });
    expect(lock.current).toBe(true);

    const p2 = withMutationLock(lock, setBusy, async () => "second");
    expect(await p2).toBeUndefined();

    resolveFirst();
    expect(await p1).toBe("ok");
    expect(lock.current).toBe(false);

    await expect(
      withMutationLock(lock, setBusy, async () => {
        throw axiosError(400, "Nie można zakończyć pobierania komponentów.");
      }),
    ).rejects.toMatchObject({ response: { status: 400 } });
    expect(lock.current).toBe(false);
  });
});

describe("count vs quantity metrics", () => {
  it("does not treat order counts as pieces in producible hint", () => {
    // 3 orders: 5+2+3=10; reserved A+B=7; shortage C=3
    const readiness = resolveMaterialReadiness({
      sourceShortageCount: 1,
      sourceReservedCount: 2,
      plannedQuantity: 10,
      materialsReserved: true,
    });
    expect(readiness).toBe("partial");
    const hint = producibleQuantityHint({
      readiness,
      sourceReservedQuantityTotal: 7,
      sourceRequestedQuantityTotal: 10,
      plannedQuantity: 10,
    });
    expect(hint).toEqual({ producible: 7, planned: 10 });
    // Bug regression: planned - shortage_count => 9 (wrong)
    expect(hint!.producible).not.toBe(10 - 1);
  });
});
