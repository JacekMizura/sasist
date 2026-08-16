import { describe, expect, it } from "vitest";

import {
  canPostAcceptPz,
  canShowPzMutationActions,
  isTerminalWarehouseDocStatus,
  resolveAcceptActionGate,
  shouldPatchLinesBeforeAccept,
} from "./warehouseStockDocumentAcceptGates";
import { computeDetailDerived } from "./warehouseStockDocumentDetailComputed";
import type { StockDocumentRead } from "../../../api/stockDocumentsApi";

/**
 * Live GET /api/stock-documents/136?tenant_id=1&warehouse_id=1 (2026-08-16)
 * after WMS receive → putaway → finalize. Status is literal `zakonczone`.
 */
const LIVE_PZ_136: StockDocumentRead = {
  id: 136,
  tenant_id: 1,
  document_type: "PZ",
  status: "zakonczone",
  edit_mode: "none",
  creation_source: "WMS",
  warehouse_id: 1,
  location_id: 458,
  receiving_status: "DONE",
  putaway_status: "DONE",
  relocation_status: "DONE",
  warehouse_workflow_status: "CLOSED",
  is_fully_received: false,
  is_fully_putaway: true,
  items: [
    {
      id: 244,
      product_id: 350,
      product_name: "Sznurowadła CAT 120 cm",
      ordered_quantity: 0,
      received_quantity: 2001,
      quantity: 2001,
      quantity_putaway: 2001,
    } as StockDocumentRead["items"][number],
  ],
} as StockDocumentRead;

describe("live PZ 136 payload gates", () => {
  it("terminal status detection", () => {
    expect(isTerminalWarehouseDocStatus(LIVE_PZ_136.status)).toBe(true);
  });

  it("computed derived → no mutation actions", () => {
    const d = computeDetailDerived(LIVE_PZ_136, "PZ");
    expect(d.editMode).toBe("none");
    expect(d.showPzActions).toBe(false);
    expect(d.canPostAccept).toBe(false);
    expect(d.lineEditEnabled).toBe(false);
    expect(d.canDeleteDocument).toBe(false);
    expect(d.isWmsCompleteDraft).toBe(true);
  });

  it("accept gate blocked — no PATCH", () => {
    const gate = resolveAcceptActionGate(LIVE_PZ_136);
    expect(gate.ok).toBe(false);
    expect(gate.patchLines).toBe(false);
    expect(shouldPatchLinesBeforeAccept(LIVE_PZ_136.edit_mode)).toBe(false);
    expect(canShowPzMutationActions({ status: LIVE_PZ_136.status, isPzDetail: true })).toBe(false);
    expect(canPostAcceptPz({ status: LIVE_PZ_136.status, warehouseId: LIVE_PZ_136.warehouse_id })).toBe(
      false,
    );
  });
});
