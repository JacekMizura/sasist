import { describe, expect, it } from "vitest";
import { draftFromLine } from "./ManufacturedRecoveryIntakePanel";
import type { WmsReturnLineRead } from "../../types/wmsReturn";

function line(over: Partial<WmsReturnLineRead> = {}): WmsReturnLineRead {
  return {
    order_item_id: 1,
    product_id: 100,
    quantity: 20,
    accepted_qty: 4,
    damaged_qty: 2,
    damaged_b_qty: 2,
    damaged_c_qty: 0,
    rejected_qty: 4,
    decision: "DAMAGED",
    manufactured_recovery_eligible: true,
    stock_intake_mode: null,
    fg_intake_qty: null,
    disassembly_qty: null,
    intake_disposition: null,
    ...over,
  };
}

describe("ManufacturedRecoveryIntakePanel draftFromLine", () => {
  it("OPTIONAL defaults each commercial bucket to FG; sum = physical_receivable not quantity", () => {
    const d = draftFromLine(line(), "OPTIONAL");
    expect(d.intake_disposition).toEqual([
      { disposition: "SALEABLE", fg_qty: 4, disassembly_qty: 0 },
      { disposition: "OUTLET_B", fg_qty: 2, disassembly_qty: 0 },
      { disposition: "SERVICE_C", fg_qty: 0, disassembly_qty: 0 },
    ]);
    expect(d.fg_intake_qty + d.disassembly_qty).toBe(6);
    expect(d.fg_intake_qty + d.disassembly_qty).not.toBe(20);
  });

  it("REQUIRED forces fg=0 and dq=full per non-zero bucket", () => {
    const d = draftFromLine(line(), "REQUIRED");
    expect(d.intake_disposition).toEqual([
      { disposition: "SALEABLE", fg_qty: 0, disassembly_qty: 4 },
      { disposition: "OUTLET_B", fg_qty: 0, disassembly_qty: 2 },
      { disposition: "SERVICE_C", fg_qty: 0, disassembly_qty: 0 },
    ]);
    expect(d.fg_intake_qty).toBe(0);
    expect(d.disassembly_qty).toBe(6);
  });

  it("reopen hydrates intake_disposition_json buckets", () => {
    const d = draftFromLine(
      line({
        intake_disposition: [
          { disposition: "SALEABLE", fg_qty: 2, disassembly_qty: 2 },
          { disposition: "OUTLET_B", fg_qty: 0, disassembly_qty: 2 },
          { disposition: "SERVICE_C", fg_qty: 0, disassembly_qty: 0 },
        ],
      }),
      "OPTIONAL",
    );
    expect(d.intake_disposition.find((r) => r.disposition === "SALEABLE")).toEqual({
      disposition: "SALEABLE",
      fg_qty: 2,
      disassembly_qty: 2,
    });
    expect(d.intake_disposition.find((r) => r.disposition === "OUTLET_B")).toEqual({
      disposition: "OUTLET_B",
      fg_qty: 0,
      disassembly_qty: 2,
    });
    expect(d.stock_intake_mode).toBe("MIXED");
  });

  it("REJECTED-only line yields zero receivable aggregates", () => {
    const d = draftFromLine(
      line({
        quantity: 1,
        accepted_qty: 0,
        damaged_b_qty: 0,
        damaged_c_qty: 0,
        damaged_qty: 0,
        rejected_qty: 1,
        decision: "REJECTED",
      }),
      "OPTIONAL",
    );
    expect(d.fg_intake_qty + d.disassembly_qty).toBe(0);
  });
});
