import { describe, expect, it } from "vitest";
import {
  resolveStockIntakeMode,
  splitReturnedQty,
} from "./stockIntakeMode";

describe("stockIntakeMode helpers", () => {
  it("resolves FG / DISASSEMBLE / MIXED from quantities", () => {
    expect(resolveStockIntakeMode(20, 0)).toBe("FG");
    expect(resolveStockIntakeMode(0, 20)).toBe("DISASSEMBLE");
    expect(resolveStockIntakeMode(5, 15)).toBe("MIXED");
    expect(resolveStockIntakeMode(0, 0)).toBeNull();
  });

  it("splits returned qty so FG + disassembly covers physical", () => {
    expect(splitReturnedQty(20, "FG")).toEqual({ fg: 20, dq: 0, mode: "FG" });
    expect(splitReturnedQty(20, "DISASSEMBLE")).toEqual({ fg: 0, dq: 20, mode: "DISASSEMBLE" });
    expect(splitReturnedQty(20, "MIXED", 5)).toEqual({ fg: 5, dq: 15, mode: "MIXED" });
    expect(splitReturnedQty(1, "MIXED")).toEqual({ fg: 0, dq: 1, mode: "DISASSEMBLE" });
  });
});
