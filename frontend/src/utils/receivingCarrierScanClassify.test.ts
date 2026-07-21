import { describe, expect, it } from "vitest";
import { classifyWmsScanCode } from "./wmsScanClassify";
import { looksLikeCarrierBarcode, normalizeCarrierBarcode } from "./carrierBarcode";

describe("receiving carrier scan classification", () => {
  it("PAL-5 is carrier_barcode, not location", () => {
    expect(classifyWmsScanCode("PAL-5")).toBe("carrier_barcode");
    expect(looksLikeCarrierBarcode("PAL-5")).toBe(true);
    expect(normalizeCarrierBarcode(" pal-5 ")).toBe("PAL-5");
  });

  it("product EAN stays ean_gtin", () => {
    expect(classifyWmsScanCode("5901234567890")).toBe("ean_gtin");
    expect(looksLikeCarrierBarcode("5901234567890")).toBe(false);
  });

  it("LOC- stays location_like", () => {
    expect(classifyWmsScanCode("LOC-A01-01")).toBe("location_like");
  });
});
