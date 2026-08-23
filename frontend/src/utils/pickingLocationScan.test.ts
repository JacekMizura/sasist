import { describe, expect, it } from "vitest";
import {
  formatWrongLocationMessage,
  resolvePickingSourceLocationScan,
} from "./pickingLocationScan";

const A1 = { location_id: 10, location_code: "A1-A-1" };
const B3 = { location_id: 23, location_code: "B3-C-1" };

describe("resolvePickingSourceLocationScan", () => {
  it("scan location A → accept A", () => {
    const r = resolvePickingSourceLocationScan({
      scan: "A1-A-1",
      locations: [A1, B3],
      expectedCode: "A1-A-1",
    });
    expect(r).toEqual({ kind: "accept", location_id: 10, location_code: "A1-A-1" });
  });

  it("scan location B when both allowed → accept B (switch)", () => {
    const r = resolvePickingSourceLocationScan({
      scan: "B3-C-1",
      locations: [A1, B3],
      expectedCode: "A1-A-1",
    });
    expect(r).toEqual({ kind: "accept", location_id: 23, location_code: "B3-C-1" });
  });

  it("scan B when only A allowed → reject_wrong; does not invent accept", () => {
    const r = resolvePickingSourceLocationScan({
      scan: "B3-C-1",
      locations: [A1],
      expectedCode: "A1-A-1",
    });
    expect(r).toEqual({
      kind: "reject_wrong",
      scanned: "B3-C-1",
      expected: "A1-A-1",
    });
  });

  it("product EAN is not_location", () => {
    const r = resolvePickingSourceLocationScan({
      scan: "5905450181185",
      locations: [A1],
      expectedCode: "A1-A-1",
    });
    expect(r).toEqual({ kind: "not_location" });
  });

  it("wrong location message includes expected and scanned", () => {
    expect(formatWrongLocationMessage("A1-A-1", "B3-C-1")).toBe(
      "Zeskanowano nieprawidłową lokalizację. Oczekiwana: A1-A-1, zeskanowana: B3-C-1.",
    );
  });
});
