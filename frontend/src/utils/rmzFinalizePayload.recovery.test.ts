import { describe, expect, it } from "vitest";
import {
  finalizeLineFromRead,
  mergeRecoveryIntoFinalizeDraft,
} from "./rmzFinalizePayload";
import type { WmsReturnLineRead } from "../types/wmsReturn";

function baseLine(over: Partial<WmsReturnLineRead> = {}): WmsReturnLineRead {
  return {
    order_item_id: 10,
    product_id: 100,
    quantity: 20,
    accepted_qty: 20,
    damaged_qty: 0,
    damaged_b_qty: 0,
    damaged_c_qty: 0,
    rejected_qty: 0,
    decision: "OK",
    manufactured_recovery_eligible: true,
    stock_intake_mode: null,
    fg_intake_qty: null,
    disassembly_qty: null,
    bom_preview: {
      composition_id: 1,
      disassembly_qty: 20,
      components: [
        {
          composition_id: 1,
          composition_line_id: 5,
          component_product_id: 200,
          expected_qty: 40,
          quantity_per_unit: 2,
          component_name: "A",
        },
      ],
    },
    ...over,
  };
}

describe("OMS RMZ finalize recovery reuse", () => {
  it("finalizeLineFromRead carries intake fields from SSOT line", () => {
    const draft = finalizeLineFromRead(
      baseLine({
        stock_intake_mode: "DISASSEMBLE",
        fg_intake_qty: 0,
        disassembly_qty: 20,
        component_recoveries: [
          {
            composition_id: 1,
            composition_line_id: 5,
            component_product_id: 200,
            expected_qty: 40,
            accepted_qty: 40,
            scrap_qty: 0,
          },
        ],
      }),
    );
    expect(draft.stock_intake_mode).toBe("DISASSEMBLE");
    expect(draft.disassembly_qty).toBe(20);
    expect(draft.fg_intake_qty).toBe(0);
    expect(draft.component_recoveries?.[0]?.accepted_qty).toBe(40);
  });

  it("mergeRecoveryIntoFinalizeDraft attaches WMS recovery draft fields", () => {
    const base = finalizeLineFromRead(baseLine());
    const merged = mergeRecoveryIntoFinalizeDraft(base, {
      stock_intake_mode: "MIXED",
      fg_intake_qty: 5,
      disassembly_qty: 15,
      component_recoveries: [
        {
          composition_line_id: 5,
          component_product_id: 200,
          accepted_qty: 30,
          scrap_qty: 0,
          expected_qty: 30,
        },
      ],
    });
    expect(merged.fg_intake_qty).toBe(5);
    expect(merged.disassembly_qty).toBe(15);
    expect(merged.stock_intake_mode).toBe("MIXED");
    expect(merged.component_recoveries).toHaveLength(1);
  });
});
