/**
 * Blind receiving — operator must not see document expected qty / difference in execution UI labels.
 */
import { describe, expect, it } from "vitest";

import { WMS_RECEIVING_DOCUMENT_CONTROL_PERMISSION } from "../pages/wms/receivingDocumentControlAccess";
import {
  documentQuantityFromLines,
  formatReceivingSignedDiff,
  receivingQuantityDifference,
} from "./receivingDocumentQtyPresentation";

describe("receiving blind vs control SSOT", () => {
  it("SSOT still computes document / received / diff", () => {
    const documentQty = documentQuantityFromLines([{ ordered_quantity: 100 }]);
    expect(documentQty).toBe(100);
    const diff = receivingQuantityDifference(documentQty, 97);
    expect(diff).toBe(-3);
    expect(formatReceivingSignedDiff(diff, (n) => String(n))).toBe("-3");
  });

  it("control permission key is stable", () => {
    expect(WMS_RECEIVING_DOCUMENT_CONTROL_PERMISSION).toBe("warehouse.receipts.control");
  });
});
