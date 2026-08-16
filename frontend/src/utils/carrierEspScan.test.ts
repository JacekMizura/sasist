import { describe, expect, it } from "vitest";
import { classifyWmsScanCode } from "./wmsScanClassify";
import {
  carrierScanCodeFromId,
  looksLikeCarrierBarcode,
  looksLikeCarrierEspScan,
} from "./carrierBarcode";

describe("carrier ESP scan classification", () => {
  it("classifies ESP:carrier:* as carrier_barcode", () => {
    expect(classifyWmsScanCode("ESP:carrier:6")).toBe("carrier_barcode");
    expect(looksLikeCarrierEspScan("ESP:carrier:6")).toBe(true);
    expect(looksLikeCarrierBarcode("ESP:carrier:6")).toBe(true);
  });

  it("still classifies legacy PAL-/BOX- as carrier", () => {
    expect(classifyWmsScanCode("PAL-000006")).toBe("carrier_barcode");
    expect(classifyWmsScanCode("BOX-12")).toBe("carrier_barcode");
  });

  it("does not treat bare 5431 as carrier", () => {
    expect(classifyWmsScanCode("5431")).not.toBe("carrier_barcode");
    expect(looksLikeCarrierBarcode("5431")).toBe(false);
  });

  it("builds canonical scan code from id", () => {
    expect(carrierScanCodeFromId(6)).toBe("ESP:carrier:6");
  });
});
