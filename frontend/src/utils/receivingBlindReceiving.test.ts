/**
 * Blind receiving — operator WMS must not see document expected qty / difference.
 * Backoffice SSOT helpers still compute document / received / diff.
 */
import { describe, expect, it } from "vitest";

import { WMS_RECEIVING_DOCUMENT_CONTROL_PERMISSION } from "../pages/wms/receivingDocumentControlAccess";
import {
  documentQuantityFromLines,
  formatReceivingSignedDiff,
  receivingQuantityDifference,
} from "./receivingDocumentQtyPresentation";
import {
  resolveWmsReceivingListStatus,
  wmsReceivingListStatusLabelPl,
} from "../pages/wms/wmsReceivingListStatus";

describe("receiving blind vs control SSOT", () => {
  it("SSOT still computes document / received / diff for backoffice", () => {
    const documentQty = documentQuantityFromLines([{ ordered_quantity: 100 }]);
    expect(documentQty).toBe(100);
    const diff = receivingQuantityDifference(documentQty, 97);
    expect(diff).toBe(-3);
    expect(formatReceivingSignedDiff(diff, (n) => String(n))).toBe("-3");
  });

  it("control permission key remains stable (not used to unblind WMS floor)", () => {
    expect(WMS_RECEIVING_DOCUMENT_CONTROL_PERMISSION).toBe("warehouse.receipts.control");
  });

  it("WMS list status ignores putaway — open receiving stays W trakcie", () => {
    expect(resolveWmsReceivingListStatus({ receiving_status: "IN_PROGRESS" })).toBe("IN_PROGRESS");
    expect(wmsReceivingListStatusLabelPl("IN_PROGRESS")).toBe("W trakcie");
  });
});
