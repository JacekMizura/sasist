import { describe, expect, it } from "vitest";

import {
  PRODUCTION_DASHBOARD_SECTION_LIMIT,
  countDueTodayFromPlannedDates,
  countOverdueFromPlannedDates,
  dashboardSeeAllHref,
  limitDashboardSectionItems,
} from "./productionDashboardHelpers";
import {
  buildPlanningQtyBreakdown,
  formatRecommendationFormula,
} from "./productionPlanningBreakdown";
import {
  coveredQtyFromStock,
  filterShortageQueueRows,
  isTrueMaterialShortage,
} from "./productionShortageDisplay";
import { getProductionOperationalState } from "./productionOperationalState";
import { erpProductionPaths } from "./productionPaths";
import { DEFAULT_PRODUCTION_RECIPE_FILTERS } from "../../modules/production/productionListFilters";

describe("productionShortageDisplay", () => {
  it("does not treat covered demand as shortage", () => {
    expect(isTrueMaterialShortage(0)).toBe(false);
    expect(isTrueMaterialShortage(0.0000001)).toBe(false);
    expect(isTrueMaterialShortage(1)).toBe(true);
  });

  it("filters missing_qty=0 from braki list", () => {
    const rows = filterShortageQueueRows([
      { missing_qty: 0 },
      { missing_qty: 2 },
      { missing_qty: -1 },
    ]);
    expect(rows).toEqual([{ missing_qty: 2 }]);
  });

  it("computes covered qty as min(required, available)", () => {
    expect(coveredQtyFromStock(10, 4)).toBe(4);
    expect(coveredQtyFromStock(3, 10)).toBe(3);
  });
});

describe("productionDashboardHelpers", () => {
  it("limits section items to dashboard max", () => {
    expect(PRODUCTION_DASHBOARD_SECTION_LIMIT).toBe(5);
    expect(limitDashboardSectionItems([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5]);
  });

  it("counts overdue and due-today from planned_date", () => {
    const dates = ["2026-08-10", "2026-08-14", "2026-08-20", null, "bad"];
    expect(countOverdueFromPlannedDates(dates, "2026-08-14")).toBe(1);
    expect(countDueTodayFromPlannedDates(dates, "2026-08-14")).toBe(1);
  });

  it("builds see-all href with bucket", () => {
    expect(dashboardSeeAllHref(erpProductionPaths.orders, "reaction")).toContain("shortages=1");
    expect(dashboardSeeAllHref(erpProductionPaths.orders, "todo")).toContain("bucket=todo");
  });
});

describe("productionPlanningBreakdown", () => {
  it("separates order_demand (brutto) from order_production_needed", () => {
    const lines = buildPlanningQtyBreakdown({
      on_hand: 20,
      in_pipeline: 4,
      order_demand: 367,
      forecast_demand: 100,
      stock_replenishment_needed: 58,
      order_production_needed: 182,
      production_moq: 10,
      production_batch_multiple: 5,
      recommended_quantity: 216,
      max_producible: 500,
    });
    const byKey = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(byKey.order_demand.value).toBe(367);
    expect(byKey.order_need.value).toBe(182);
    expect(byKey.covering.value).toBe(185);
    expect(byKey.stock_replenishment.value).toBe(58);
    expect(byKey.forecast_demand.label).toBe("Cel zapasu");
    expect(String(byKey.formula.value)).toContain("Zamówienia do pokrycia: 182");
    expect(String(byKey.formula.value)).toContain("uzupełnienie zapasu: 58");
    expect(String(byKey.formula.value)).toContain("rekomendacja: 216");
    expect(byKey.recommended.value).toBe(216);
  });

  it("formatRecommendationFormula follows engine parts", () => {
    expect(
      formatRecommendationFormula({
        orderNeed: 182,
        stockNeed: 58,
        sumParts: 240,
        recommended: 216,
      }),
    ).toMatch(/Zamówienia do pokrycia: 182 \+ uzupełnienie zapasu: 58 = 240/);
  });
});

describe("pulpit vs zlecenia stage parity", () => {
  it("BAT planned+delayed keeps stage and Opóźnione flag together", () => {
    const pulp = getProductionOperationalState({
      executionKind: "batch",
      id: 10,
      status: "planned",
      plannedDate: "2020-01-01",
      hasShortages: false,
    });
    const orders = getProductionOperationalState({
      executionKind: "batch",
      id: 10,
      status: "planned",
      plannedDate: "2020-01-01",
      hasShortages: false,
    });
    expect(pulp.businessLabel).toBe(orders.businessLabel);
    expect(pulp.businessLabel).toBe("Przekaż do realizacji");
    expect(pulp.isDelayed).toBe(true);
    expect(orders.isDelayed).toBe(true);
  });
});

describe("DEFAULT_PRODUCTION_RECIPE_FILTERS", () => {
  it("defaults to active recipes only", () => {
    expect(DEFAULT_PRODUCTION_RECIPE_FILTERS.status).toBe("active");
  });
});
