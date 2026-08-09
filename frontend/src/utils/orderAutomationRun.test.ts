import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderAutomationRule } from "../types/orderAutomation";
import { defaultManualTrigger } from "./orderAutomationManualTrigger";
import { saveAutomationRules } from "./orderAutomationLocalStore";
import {
  activatorButtonLabel,
  createExclusiveActivatorRunGate,
  executeOrderAutomationEffects,
  packingAutomationActivatorRules,
  runOrderAutomationActivator,
} from "./orderAutomationRun";

vi.mock("../api/orderUiStatusApi", () => ({
  patchOrderUiStatus: vi.fn(),
}));

import { patchOrderUiStatus } from "../api/orderUiStatusApi";

const patchMock = vi.mocked(patchOrderUiStatus);

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const api = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: api, configurable: true });
}

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

installMemoryLocalStorage();

describe("packingAutomationActivatorRules", () => {
  const tenantId = 1;
  const warehouseId = 9;

  beforeEach(() => {
    localStorage.clear();
    patchMock.mockReset();
    patchMock.mockResolvedValue({} as never);
  });

  it("shows a button rule when activator is configured for packing", () => {
    saveAutomationRules(tenantId, warehouseId, [baseRule({ id: "r1", name: "Status X" })]);
    const rules = packingAutomationActivatorRules(tenantId, warehouseId);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe("r1");
  });

  it("shows two independent activator rules", () => {
    saveAutomationRules(tenantId, warehouseId, [
      baseRule({ id: "a", name: "A", manualTrigger: { ...defaultManualTrigger(), enabled: true, label: "Nadaj" } }),
      baseRule({ id: "b", name: "B", manualTrigger: { ...defaultManualTrigger(), enabled: true, label: "Drukuj" } }),
    ]);
    const rules = packingAutomationActivatorRules(tenantId, warehouseId);
    expect(rules.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(activatorButtonLabel(rules.find((r) => r.id === "a")!)).toBe("Nadaj");
    expect(activatorButtonLabel(rules.find((r) => r.id === "b")!)).toBe("Drukuj");
  });

  it("hides disabled activator / rule / packing visibility / button off", () => {
    saveAutomationRules(tenantId, warehouseId, [
      baseRule({ id: "off-rule", name: "Off", enabled: false }),
      baseRule({
        id: "off-manual",
        name: "Off manual",
        manualTrigger: { ...defaultManualTrigger(), enabled: false },
      }),
      baseRule({
        id: "off-btn",
        name: "Off btn",
        manualTrigger: { ...defaultManualTrigger(), enabled: true, buttonEnabled: false },
      }),
      baseRule({
        id: "off-packing",
        name: "Off packing",
        manualTrigger: { ...defaultManualTrigger(), enabled: true, visibleOnWmsPacking: false },
      }),
    ]);
    expect(packingAutomationActivatorRules(tenantId, warehouseId)).toEqual([]);
  });
});

describe("executeOrderAutomationEffects / runOrderAutomationActivator", () => {
  const tenantId = 1;
  const warehouseId = 9;
  const orderId = 100;

  beforeEach(() => {
    localStorage.clear();
    patchMock.mockReset();
    patchMock.mockResolvedValue({} as never);
  });

  it("click path executes change_status via existing API", async () => {
    const rule = baseRule({ id: "r1", name: "Zmień", manualTrigger: { ...defaultManualTrigger(), enabled: true, label: "Wyślij" } });
    const result = await runOrderAutomationActivator({ tenantId, warehouseId, orderId, rule });
    expect(patchMock).toHaveBeenCalledWith(orderId, tenantId, warehouseId, 42);
    expect(result.effectsExecuted).toEqual(["change_status→42"]);
    expect(result.successMessage).toBe("Wykonano: Wyślij");
  });

  it("falls back to rule name then Akcja for label", () => {
    expect(
      activatorButtonLabel(
        baseRule({
          id: "x",
          name: "Reguła",
          manualTrigger: { ...defaultManualTrigger(), label: "  " },
        }),
      ),
    ).toBe("Reguła");
    expect(
      activatorButtonLabel(
        baseRule({
          id: "y",
          name: "  ",
          manualTrigger: { ...defaultManualTrigger(), label: "" },
        }),
      ),
    ).toBe("Akcja");
  });

  it("rejects empty effects and unsupported kinds with Polish errors", async () => {
    await expect(
      executeOrderAutomationEffects({ tenantId, warehouseId, orderId, effects: [] }),
    ).rejects.toThrow("Reguła nie ma skonfigurowanych akcji do wykonania.");

    await expect(
      executeOrderAutomationEffects({
        tenantId,
        warehouseId,
        orderId,
        effects: [{ uid: "e", kind: "send_message", payload: { template: "x" } }],
      }),
    ).rejects.toThrow(/wiadomości/i);
  });

  it("surfaces API failure as Polish error message", async () => {
    patchMock.mockRejectedValue({
      response: { data: { detail: "Status nie istnieje w tym magazynie." } },
    });
    const rule = baseRule({ id: "r1", name: "Zmień" });
    await expect(runOrderAutomationActivator({ tenantId, warehouseId, orderId, rule })).rejects.toThrow(
      "Status nie istnieje w tym magazynie.",
    );
  });

  it("blocks concurrent runs of the same activator", async () => {
    const gate = createExclusiveActivatorRunGate();
    expect(gate.tryBegin("same")).toBe(true);
    expect(gate.tryBegin("same")).toBe(false);
    expect(gate.tryBegin("other")).toBe(false);
    gate.end("same");
    expect(gate.tryBegin("same")).toBe(true);
    gate.end("same");
  });
});
