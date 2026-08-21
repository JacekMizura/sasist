import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderAutomationRule } from "../types/orderAutomation";
import { defaultManualTrigger } from "./orderAutomationManualTrigger";
import {
  activatorButtonLabel,
  createExclusiveActivatorRunGate,
  executeOrderAutomationEffects,
  packingAutomationActivatorRules,
  runOrderAutomationActivator,
} from "./orderAutomationRun";

vi.mock("../api/automationsApi", () => ({
  listAutomations: vi.fn(async () => []),
  runAutomation: vi.fn(async () => ({ status: "SUCCEEDED", planned_effects: [{ effect_type: "change_status" }] })),
}));

import { listAutomations, runAutomation } from "../api/automationsApi";

const listMock = vi.mocked(listAutomations);
const runMock = vi.mocked(runAutomation);

function baseRule(partial: Partial<OrderAutomationRule> & Pick<OrderAutomationRule, "id" | "name">): OrderAutomationRule {
  return {
    group: "",
    enabled: true,
    manualTrigger: {
      ...defaultManualTrigger(),
      enabled: true,
      buttonEnabled: true,
      visibleOnWmsPacking: true,
      label: "Akcja",
    },
    conditions: [],
    effects: [{ uid: "e1", kind: "change_status", payload: { order_ui_status_id: "42" } }],
    execution: {
      automatic: false,
      runMode: "continuous",
      windowFrom: "08:00",
      windowTo: "16:00",
      activeDays: [1, 2, 3, 4, 5],
    },
    stats: { lastRunAt: null, runCount: 0 },
    ...partial,
  };
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

installMemoryLocalStorage();

describe("orderAutomationRun backend SSOT", () => {
  beforeEach(() => {
    localStorage.clear();
    listMock.mockReset();
    runMock.mockReset();
    runMock.mockResolvedValue({
      status: "SUCCEEDED",
      planned_effects: [{ effect_type: "change_status" }],
    });
  });

  it("packingAutomationActivatorRules loads from backend API", async () => {
    listMock.mockResolvedValue([
      {
        id: 7,
        tenant_id: 1,
        warehouse_id: 9,
        entity_type: "ORDER",
        name: "Status X",
        enabled: true,
        trigger_type: "entity_status_entered",
        trigger_config: {},
        source: "USER_AUTOMATION",
        effects: [{ position: 0, effect_type: "change_status", config: { status_id: 42 }, enabled: true }],
        metadata: {
          manualTrigger: {
            ...defaultManualTrigger(),
            enabled: true,
            buttonEnabled: true,
            visibleOnWmsPacking: true,
            label: "Akcja",
          },
          execution: { automatic: false },
          stats: { lastRunAt: null, runCount: 0 },
        },
        conditions: [],
        group: "Ogólne",
      },
    ]);
    const rules = await packingAutomationActivatorRules(1, 9);
    expect(listMock).toHaveBeenCalled();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("7");
  });

  it("runOrderAutomationActivator calls backend /run", async () => {
    const rule = baseRule({ id: "12", name: "X" });
    const result = await runOrderAutomationActivator({
      tenantId: 1,
      warehouseId: 9,
      orderId: 55,
      rule,
    });
    expect(runMock).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        tenant_id: 1,
        entity_type: "ORDER",
        entity_id: 55,
        dry_run: false,
      }),
    );
    expect(result.successMessage).toContain("Akcja");
  });

  it("executeOrderAutomationEffects is retired and throws", async () => {
    await expect(
      executeOrderAutomationEffects({
        tenantId: 1,
        warehouseId: 1,
        orderId: 1,
        effects: [],
      }),
    ).rejects.toThrow(/retired/);
  });

  it("activatorButtonLabel uses manual label", () => {
    expect(activatorButtonLabel(baseRule({ id: "1", name: "N" }))).toBe("Akcja");
  });

  it("exclusive gate blocks concurrent runs", () => {
    const gate = createExclusiveActivatorRunGate();
    expect(gate.tryBegin("a")).toBe(true);
    expect(gate.tryBegin("b")).toBe(false);
    gate.end("a");
    expect(gate.tryBegin("b")).toBe(true);
  });
});
