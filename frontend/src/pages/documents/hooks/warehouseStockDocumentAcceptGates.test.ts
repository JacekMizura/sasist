import { describe, expect, it } from "vitest";

import {
  canPostAcceptPz,
  canShowPzMutationActions,
  isTerminalWarehouseDocStatus,
  isWmsCompletedPzStatus,
  resolveAcceptActionGate,
  shouldPatchLinesBeforeAccept,
} from "./warehouseStockDocumentAcceptGates";
import { computeDetailDerived } from "./warehouseStockDocumentDetailComputed";
import type { StockDocumentRead } from "../../../api/stockDocumentsApi";

function baseDoc(over: Partial<StockDocumentRead> = {}): StockDocumentRead {
  return {
    id: 136,
    tenant_id: 1,
    document_type: "PZ",
    status: "draft",
    warehouse_id: 1,
    edit_mode: "full",
    items: [
      {
        id: 1,
        product_id: 1,
        ordered_quantity: 2001,
        received_quantity: 0,
        quantity: 0,
        quantity_putaway: 0,
      } as StockDocumentRead["items"][number],
    ],
    ...over,
  } as StockDocumentRead;
}

describe("warehouseStockDocumentAcceptGates", () => {
  it("A: draft full → PATCH allowed gate", () => {
    const gate = resolveAcceptActionGate(baseDoc({ status: "draft", edit_mode: "full" }));
    expect(gate.ok).toBe(true);
    expect(gate.patchLines).toBe(true);
    expect(shouldPatchLinesBeforeAccept("full")).toBe(true);
    expect(canShowPzMutationActions({ status: "draft", isPzDetail: true })).toBe(true);
    expect(canPostAcceptPz({ status: "draft", warehouseId: 1 })).toBe(true);
  });

  it("B: zakonczone → no actions / no accept", () => {
    expect(isWmsCompletedPzStatus("zakonczone")).toBe(true);
    expect(canShowPzMutationActions({ status: "zakonczone", isPzDetail: true })).toBe(false);
    expect(canPostAcceptPz({ status: "zakonczone", warehouseId: 1 })).toBe(false);
    const d = computeDetailDerived(
      baseDoc({
        status: "zakonczone",
        edit_mode: "none",
        receiving_status: "DONE",
        putaway_status: "DONE",
        relocation_status: "DONE",
        is_fully_received: true,
        is_fully_putaway: true,
      }),
      "PZ",
    );
    expect(d.editMode).toBe("none");
    expect(d.showPzActions).toBe(false);
    expect(d.canPostAccept).toBe(false);
    expect(d.lineEditEnabled).toBe(false);
    expect(d.canDeleteDocument).toBe(false);
  });

  it("C: zakonczone accept() gate → no PATCH", () => {
    const gate = resolveAcceptActionGate(
      baseDoc({ status: "zakonczone", edit_mode: "none", warehouse_id: 1 }),
    );
    expect(gate.ok).toBe(false);
    expect(gate.patchLines).toBe(false);
    expect(shouldPatchLinesBeforeAccept("none")).toBe(false);
  });

  it("D: WMS complete is terminal — no re-post path on FE", () => {
    expect(isTerminalWarehouseDocStatus("zakonczone")).toBe(true);
    const gate = resolveAcceptActionGate(baseDoc({ status: "zakonczone", edit_mode: "none" }));
    expect(gate.ok).toBe(false);
    expect(gate.message).toMatch(/WMS/i);
  });

  it("E: posted → read-only", () => {
    expect(isTerminalWarehouseDocStatus("posted")).toBe(true);
    expect(canShowPzMutationActions({ status: "posted", isPzDetail: true })).toBe(false);
    expect(canPostAcceptPz({ status: "posted", warehouseId: 1 })).toBe(false);
    const gate = resolveAcceptActionGate(baseDoc({ status: "posted", edit_mode: "none" }));
    expect(gate.ok).toBe(false);
    expect(gate.patchLines).toBe(false);
  });

  it("draft metadata → accept without PATCH (WMS in-progress OMS)", () => {
    const gate = resolveAcceptActionGate(baseDoc({ status: "draft", edit_mode: "metadata" }));
    expect(gate.ok).toBe(true);
    expect(gate.patchLines).toBe(false);
  });

  it("F/G: terminal still allows duplicate/print at UI policy level (not gated here)", () => {
    // Duplicate/print remain available in footer for zakonczone; mutation gates stay false.
    expect(canShowPzMutationActions({ status: "zakonczone", isPzDetail: true })).toBe(false);
  });
});
