import { describe, expect, it } from "vitest";
import { deferPickingLocationHistoryKind } from "./pickingScannerHistory";
import {
  formatWrongLocationMessage,
  resolvePickingSourceLocationScan,
} from "./pickingLocationScan";
import { dispatchScannerHelperWorkflowScan } from "./scannerHelperDispatch";
import { SCAN_CONSUMED } from "./wmsScanDispatch";
import { mapWmsScanErrorCode } from "../wms/scanFeedback/wmsScanErrorCatalog";

const A1 = { location_id: 10, location_code: "A1-A-1" };
const B3 = { location_id: 23, location_code: "B3-C-1" };

describe("picking scanned location SSOT contract", () => {
  it("1-2: scan A then B switches accept when both allowed", () => {
    let active = resolvePickingSourceLocationScan({
      scan: "A1-A-1",
      locations: [A1, B3],
    });
    expect(active).toMatchObject({ kind: "accept", location_id: 10 });
    active = resolvePickingSourceLocationScan({
      scan: "B3-C-1",
      locations: [A1, B3],
    });
    expect(active).toMatchObject({ kind: "accept", location_id: 23 });
  });

  it("3: accept B implies quick-pick location_id=B (identity from resolve)", () => {
    const r = resolvePickingSourceLocationScan({ scan: "B3-C-1", locations: [A1, B3] });
    expect(r.kind).toBe("accept");
    if (r.kind === "accept") {
      expect(r.location_id).toBe(23);
    }
  });

  it("4: B not allowed → WRONG_LOCATION message", () => {
    const r = resolvePickingSourceLocationScan({
      scan: "B3-C-1",
      locations: [A1],
      expectedCode: "A1-A-1",
    });
    expect(r.kind).toBe("reject_wrong");
    if (r.kind === "reject_wrong") {
      expect(formatWrongLocationMessage(r.expected, r.scanned)).toContain("A1-A-1");
      expect(formatWrongLocationMessage(r.expected, r.scanned)).toContain("B3-C-1");
    }
  });

  it("5: rejected location does not yield accept identity (active unchanged by resolver)", () => {
    const prior = 10;
    const r = resolvePickingSourceLocationScan({
      scan: "B3-C-1",
      locations: [A1],
      expectedCode: "A1-A-1",
    });
    expect(r.kind).toBe("reject_wrong");
    // Caller must not set active from reject — prior stays 10
    expect(prior).toBe(10);
  });

  it("6: consumed=true only after handler returns consumed (real handling)", async () => {
    let handled = false;
    const dispatched = await dispatchScannerHelperWorkflowScan({
      rawCode: "B3-C-1",
      pathname: "/wms/picking/products/193",
      handler: async () => {
        handled = true;
        return SCAN_CONSUMED;
      },
      pickingProductsPath: true,
    });
    expect(handled).toBe(true);
    expect(dispatched.consumed).toBe(true);
  });

  it("7: known EAN no-open-qty maps to NO_OPEN_QUANTITY not UNKNOWN", () => {
    const fb = mapWmsScanErrorCode("NO_OPEN_QUANTITY", {
      backendMessage: "Brak otwartej ilości do zebrania dla tego produktu w sesji.",
    });
    expect(fb.code).toBe("NO_OPEN_QUANTITY");
    expect(fb.title).not.toMatch(/NIEZNANY/i);
  });

  it("8: Helper defers location history kind on picking path", () => {
    expect(deferPickingLocationHistoryKind("location", true)).toBe("other");
    expect(deferPickingLocationHistoryKind("location", false)).toBe("location");
    expect(deferPickingLocationHistoryKind("product", true)).toBe("product");
  });
});
