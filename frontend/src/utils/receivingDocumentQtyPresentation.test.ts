import { describe, expect, it } from "vitest";

import {
  documentQuantityFromLines,
  formatReceivingSignedDiff,
  receivingDifferenceToneClass,
  receivingQuantityDifference,
} from "./receivingDocumentQtyPresentation";

describe("receivingDocumentQtyPresentation", () => {
  it("A: document 10 actual 8 → diff -2 red", () => {
    expect(receivingQuantityDifference(10, 8)).toBe(-2);
    expect(receivingDifferenceToneClass(-2)).toContain("red");
  });

  it("B: document 10 actual 10 → diff 0 neutral", () => {
    expect(receivingQuantityDifference(10, 10)).toBe(0);
    expect(receivingDifferenceToneClass(0)).toContain("slate");
  });

  it("C: document 10 actual 12 → diff +2 green", () => {
    expect(receivingQuantityDifference(10, 12)).toBe(2);
    expect(formatReceivingSignedDiff(2, String)).toBe("+2");
    expect(receivingDifferenceToneClass(2)).toContain("emerald");
  });

  it("F: ordered 0 legacy unknown → no fake difference", () => {
    expect(documentQuantityFromLines([{ ordered_quantity: 0 }])).toBeNull();
    expect(receivingQuantityDifference(0, 11)).toBeNull();
    expect(formatReceivingSignedDiff(null, String)).toBe("—");
  });

  it("document qty uses max ordered among siblings", () => {
    expect(
      documentQuantityFromLines([
        { ordered_quantity: 10 },
        { ordered_quantity: 0 },
      ]),
    ).toBe(10);
  });
});
