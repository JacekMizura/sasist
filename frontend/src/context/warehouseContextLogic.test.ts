import { describe, expect, it } from "vitest";

import type { WarehouseContextResponse } from "../api/authApi";
import {
  applyWarehouseContext,
  hasOperableWarehouses,
  pickActiveWarehouse,
} from "./warehouseContextLogic";

describe("pickActiveWarehouse", () => {
  it("returns matching active id", () => {
    const list = [
      { id: 1, name: "Warszawa" },
      { id: 2, name: "Główny" },
    ];
    expect(pickActiveWarehouse(list, 2)).toEqual({ id: 2, name: "Główny" });
  });

  it("falls back to first warehouse when active id missing", () => {
    const list = [{ id: 5, name: "Only" }];
    expect(pickActiveWarehouse(list, null)).toEqual({ id: 5, name: "Only" });
  });
});

describe("applyWarehouseContext", () => {
  it("hides selector for single warehouse (scenario 1)", () => {
    const ctx: WarehouseContextResponse = {
      active_warehouse_id: 1,
      warehouses: [{ id: 1, name: "Magazyn A" }],
      show_warehouse_selector: false,
      assignments: [{ warehouse_id: 1, is_default: true, can_operate: true }],
      uses_legacy_all_warehouses: false,
    };
    const applied = applyWarehouseContext(ctx);
    expect(applied.showSelector).toBe(false);
    expect(applied.list).toHaveLength(1);
    expect(applied.active?.id).toBe(1);
    expect(applied.activeRequiresPutaway).toBe(true);
  });

  it("shows selector for two warehouses (scenario 2)", () => {
    const ctx: WarehouseContextResponse = {
      active_warehouse_id: 1,
      warehouses: [
        { id: 1, name: "Warszawa" },
        { id: 2, name: "Magazyn główny" },
      ],
      show_warehouse_selector: true,
      assignments: [
        { warehouse_id: 1, is_default: true, can_operate: true },
        { warehouse_id: 2, is_default: false, can_operate: true },
      ],
      uses_legacy_all_warehouses: false,
    };
    const applied = applyWarehouseContext(ctx);
    expect(applied.showSelector).toBe(true);
    expect(applied.list).toHaveLength(2);
  });

  it("respects show_warehouse_selector flag from backend", () => {
    const ctx: WarehouseContextResponse = {
      active_warehouse_id: 1,
      warehouses: [{ id: 1, name: "A", requires_putaway: false }],
      show_warehouse_selector: true,
      assignments: [],
      uses_legacy_all_warehouses: false,
      active_warehouse_requires_putaway: false,
    };
    const applied = applyWarehouseContext(ctx);
    expect(applied.showSelector).toBe(true);
    expect(applied.activeRequiresPutaway).toBe(false);
  });
});

describe("hasOperableWarehouses", () => {
  it("returns false when list empty (scenario 5 UX gate)", () => {
    expect(hasOperableWarehouses([])).toBe(false);
  });

  it("returns true when at least one warehouse assigned", () => {
    expect(hasOperableWarehouses([{ id: 1, name: "A" }])).toBe(true);
  });
});
