/**
 * StatusActionsPanel / send_email mapping smoke.
 */
import { describe, expect, it } from "vitest";
import { feRuleToCreateBody, backendRuleToFe } from "./orderAutomationBackendMap";
import type { OrderAutomationRule } from "../types/orderAutomation";
import { defaultExecution } from "./orderAutomationExecution";
import { defaultManualTrigger } from "./orderAutomationManualTrigger";
import { ORDER_AUTOMATION_EFFECT_KINDS, buildEffectCategorySteps } from "./orderAutomationCatalog";

describe("send_email automation FE", () => {
  it("maps send_email payload to backend config", () => {
    const rule: OrderAutomationRule = {
      id: "rule-1",
      publicId: 1,
      name: "Mail",
      group: "Ogólne",
      enabled: true,
      manualTrigger: defaultManualTrigger(),
      conditions: [],
      effects: [
        {
          uid: "e1",
          kind: "send_email",
          payload: { template_id: 42, recipient_type: "CUSTOMER" },
        },
      ],
      execution: defaultExecution(),
      delayMinutes: 0,
      stats: { lastRunAt: null, runCount: 0 },
    };
    const body = feRuleToCreateBody(rule, { tenantId: 1, warehouseId: 1 });
    expect(body.effects[0].effect_type).toBe("send_email");
    expect(body.effects[0].config.template_id).toBe(42);
    expect(body.effects[0].config.recipient_type).toBe("CUSTOMER");
  });

  it("maps legacy send_message to send_email on save", () => {
    const rule: OrderAutomationRule = {
      id: "rule-2",
      publicId: 2,
      name: "Legacy",
      group: "Ogólne",
      enabled: true,
      manualTrigger: defaultManualTrigger(),
      conditions: [],
      effects: [{ uid: "e1", kind: "send_message", payload: { template_id: 7 } }],
      execution: defaultExecution(),
      delayMinutes: 0,
      stats: { lastRunAt: null, runCount: 0 },
    };
    const body = feRuleToCreateBody(rule, { tenantId: 1, warehouseId: 1 });
    expect(body.effects[0].effect_type).toBe("send_email");
  });

  it("exposes send_email in active effect picker", () => {
    expect(ORDER_AUTOMATION_EFFECT_KINDS.some((k) => k.kind === "send_email" && k.backendSupported)).toBe(true);
    const steps = buildEffectCategorySteps();
    const ids = steps.flatMap((s) => s.items.map((i) => i.id));
    expect(ids).toContain("send_email");
    expect(ids).not.toContain("send_message");
  });

  it("normalizes backend send_email into FE rule", () => {
    const fe = backendRuleToFe({
      id: 9,
      tenant_id: 1,
      warehouse_id: 1,
      entity_type: "ORDER",
      name: "X",
      enabled: true,
      trigger_type: "entity_status_entered",
      trigger_config: {},
      source: "STATUS_ACTION",
      effects: [
        {
          id: 1,
          position: 0,
          effect_type: "send_email",
          config: { template_id: 3, recipient_type: "CUSTOMER" },
          enabled: true,
        },
      ],
    });
    expect(fe.effects[0].kind).toBe("send_email");
    expect(fe.effects[0].payload.template_id).toBe(3);
  });
});
