import { describe, expect, it } from "vitest";

import {
  canSubmitFgProduction,
  clampProduceQtyInput,
  isFgIdentityValid,
  isProductionQtyValid,
  paperProduceDefaultQty,
  parseFgSerialList,
  shouldShowPaperHeaderProductionProgress,
} from "./productionFgIdentity";

describe("paper produce UX helpers", () => {
  describe("A — default input = remaining", () => {
    it("plan 44 done 10 → default 34", () => {
      expect(paperProduceDefaultQty(44 - 10)).toBe(34);
    });
  });

  describe("B — partial then new remaining", () => {
    it("after submit 20 → remaining 14 → default 14", () => {
      const planned = 44;
      const doneAfter = 10 + 20;
      const remaining = planned - doneAfter;
      expect(remaining).toBe(14);
      expect(paperProduceDefaultQty(remaining)).toBe(14);
    });
  });

  describe("C — full remaining submit math", () => {
    it("done 10 + remaining 34 → 44/44", () => {
      expect(10 + 34).toBe(44);
      expect(isProductionQtyValid(34, 34)).toBe(true);
    });
  });

  describe("D/E — qty FE gates", () => {
    it("qty > remaining blocked", () => {
      expect(isProductionQtyValid(35, 34)).toBe(false);
      expect(canSubmitFgProduction(35, 34, {}, {})).toBe(false);
    });

    it("qty <= 0 blocked", () => {
      expect(isProductionQtyValid(0, 34)).toBe(false);
      expect(isProductionQtyValid(-1, 34)).toBe(false);
      expect(canSubmitFgProduction(0, 34, {}, {})).toBe(false);
    });
  });

  describe("F/G/H/I — identity FE gates", () => {
    it("F: LOT required empty → blocked", () => {
      expect(
        isFgIdentityValid(5, { batchNumber: "" }, { requireBatch: true }),
      ).toBe(false);
      expect(
        canSubmitFgProduction(5, 34, { batchNumber: "" }, { requireBatch: true }),
      ).toBe(false);
    });

    it("F: LOT required filled → ok", () => {
      expect(
        canSubmitFgProduction(5, 34, { batchNumber: "LOT-1" }, { requireBatch: true }),
      ).toBe(true);
    });

    it("G: expiry required empty → blocked", () => {
      expect(
        canSubmitFgProduction(5, 34, { expiryDate: "" }, { requireExpiry: true }),
      ).toBe(false);
    });

    it("G: expiry required filled → ok", () => {
      expect(
        canSubmitFgProduction(5, 34, { expiryDate: "2027-01-01" }, { requireExpiry: true }),
      ).toBe(true);
    });

    it("H: SN required qty 5 count 4 → blocked", () => {
      expect(
        canSubmitFgProduction(
          5,
          34,
          { serialsRaw: "a\nb\nc\nd" },
          { requireSerial: true },
        ),
      ).toBe(false);
    });

    it("H: SN duplicates do not count as unique → blocked", () => {
      expect(
        canSubmitFgProduction(
          5,
          34,
          { serialsRaw: "a\nb\nc\nd\na" },
          { requireSerial: true },
        ),
      ).toBe(false);
    });

    it("I: SN required qty 5 count 5 unique → allowed", () => {
      expect(
        canSubmitFgProduction(
          5,
          34,
          { serialsRaw: "a\nb\nc\nd\ne" },
          { requireSerial: true },
        ),
      ).toBe(true);
      expect(parseFgSerialList("a\nb\nc\nd\ne")).toHaveLength(5);
    });
  });

  describe("J/K — progress duplication", () => {
    it("J: single-line → no header progress", () => {
      expect(shouldShowPaperHeaderProductionProgress(1)).toBe(false);
    });

    it("K: multi-line → header aggregate allowed", () => {
      expect(shouldShowPaperHeaderProductionProgress(2)).toBe(true);
      expect(shouldShowPaperHeaderProductionProgress(3)).toBe(true);
    });
  });

  describe("quick actions clamp", () => {
    it("clamps +5 to remaining", () => {
      expect(clampProduceQtyInput(32 + 5, 34)).toBe(34);
    });

    it("clamps below zero", () => {
      expect(clampProduceQtyInput(-3, 34)).toBe(0);
    });
  });
});
