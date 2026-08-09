import { describe, expect, it } from "vitest";

import type { OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import {
  allowedPickingSourceStatusIds,
  allowedPickingTargetStatusIds,
  filterPanelSummaryByStatusIds,
  isStatusAllowedForPickingConfig,
  packingStartStatusIdsFromSettings,
} from "./pickingConfigStatusEligibility";

function summaryFixture(): OrderUiStatusPanelSummary {
  return {
    unassigned_count: 0,
    groups: [
      {
        main_group: "NEW",
        total_count: 0,
        sub_statuses: [
          {
            id: 1,
            tenant_id: 1,
            warehouse_id: 1,
            main_group: "NEW",
            name: "Nowe",
            color: "#000",
            sort_order: 0,
            is_system: false,
            is_active: true,
            count: 0,
          },
          {
            id: 2,
            tenant_id: 1,
            warehouse_id: 1,
            main_group: "NEW",
            name: "Nowe nieaktywne",
            color: "#000",
            sort_order: 1,
            is_system: false,
            is_active: false,
            count: 0,
          },
        ],
      },
      {
        main_group: "IN_PROGRESS",
        total_count: 0,
        sub_statuses: [
          {
            id: 10,
            tenant_id: 1,
            warehouse_id: 1,
            main_group: "IN_PROGRESS",
            name: "Do zbierania",
            color: "#000",
            sort_order: 0,
            is_system: false,
            is_active: true,
            count: 0,
          },
          {
            id: 11,
            tenant_id: 1,
            warehouse_id: 1,
            main_group: "IN_PROGRESS",
            name: "Do pakowania",
            color: "#000",
            sort_order: 1,
            is_system: false,
            is_active: true,
            count: 0,
          },
        ],
      },
      {
        main_group: "DONE",
        total_count: 0,
        sub_statuses: [
          {
            id: 20,
            tenant_id: 1,
            warehouse_id: 1,
            main_group: "DONE",
            name: "Wysłane",
            color: "#000",
            sort_order: 0,
            is_system: false,
            is_active: true,
            count: 0,
          },
        ],
      },
    ],
  };
}

describe("pickingConfigStatusEligibility", () => {
  it("source: active NEW/IN_PROGRESS, excludes DONE and other rule sources", () => {
    const ids = allowedPickingSourceStatusIds({
      summary: summaryFixture(),
      excludeSourceIds: [10],
    });
    expect([...ids].sort((a, b) => a - b)).toEqual([1, 11]);
  });

  it("target: active IN_PROGRESS plus packing starts", () => {
    const ids = allowedPickingTargetStatusIds({
      summary: summaryFixture(),
      packingStartStatusIds: [1, 20],
    });
    expect(ids.has(10)).toBe(true);
    expect(ids.has(11)).toBe(true);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(20)).toBe(true);
    expect(ids.has(2)).toBe(false);
  });

  it("filterPanelSummary removes empty groups and can retain selected", () => {
    const allowed = new Set([10]);
    const filtered = filterPanelSummaryByStatusIds(summaryFixture(), allowed, [20]);
    expect(filtered?.groups.map((g) => g.main_group)).toEqual(["IN_PROGRESS", "DONE"]);
    expect(filtered?.groups.flatMap((g) => g.sub_statuses.map((s) => s.id))).toEqual([10, 20]);
  });

  it("packingStartStatusIdsFromSettings merges start + allowed", () => {
    expect(
      packingStartStatusIdsFromSettings({
        start_status_id: 11,
        allowed_start_status_ids: [11, 12, 0],
      }).sort((a, b) => a - b),
    ).toEqual([11, 12]);
  });

  it("isStatusAllowedForPickingConfig", () => {
    expect(isStatusAllowedForPickingConfig(10, new Set([10]))).toBe(true);
    expect(isStatusAllowedForPickingConfig(9, new Set([10]))).toBe(false);
  });
});
