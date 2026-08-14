import { describe, expect, it } from "vitest";

import {
  PRODUCTION_DASHBOARD_SECTION_LIMIT,
  countDueTodayFromPlannedDates,
  countOverdueFromPlannedDates,
  dashboardSeeAllHref,
  limitDashboardSectionItems,
} from "./productionDashboardHelpers";
import { buildPlanningQtyBreakdown } from "./productionPlanningBreakdown";
import {
  coveredQtyFromStock,
  filterShortageQueueRows,
  isTrueMaterialShortage,
} from "./productionShortageDisplay";
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
    expect(dashboardSeeAllHref("/production/orders", "reaction")).toContain("shortages=1");
    expect(dashboardSeeAllHref("/production/orders", "todo")).toContain("bucket=todo");
  });
});

describe("productionPlanningBreakdown", () => {
  it("exposes stock / pipeline / orders / target / recommended", () => {
    const lines = buildPlanningQtyBreakdown({
      on_hand: 2,
      in_pipeline: 1,
      order_demand: 5,
      forecast_demand: 12,
      stock_replenishment_needed: 9,
      production_moq: 10,
      production_batch_multiple: 5,
      recommended_quantity: 15,
    });
    const byKey = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(byKey.forecast_demand.label).toBe("Cel zapasu");
    expect(byKey.forecast_demand.value).toBe(12);
    expect(byKey.moq.value).toBe(10);
    expect(byKey.multiple.value).toBe(5);
    expect(byKey.recommended.value).toBe(15);
  });
});

describe("DEFAULT_PRODUCTION_RECIPE_FILTERS", () => {
  it("defaults to active recipes only", () => {
    expect(DEFAULT_PRODUCTION_RECIPE_FILTERS.status).toBe("active");
  });
});
