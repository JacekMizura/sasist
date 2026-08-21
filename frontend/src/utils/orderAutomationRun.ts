/**
 * Wykonanie reguł „Akcje automatyczne” — backend Automation Engine SSOT.
 * FE localStorage executor is DEAD for runtime; packing activators call POST /automations/{id}/run.
 */
import { extractApiErrorMessage } from "../api/apiErrorMessage";
import { listAutomations, runAutomation } from "../api/automationsApi";
import type { OrderAutomationRule } from "../types/orderAutomation";
import {
  appendAutomationExecutionLog,
  newUid,
} from "./orderAutomationLocalStore";
import { backendRuleToFe } from "./orderAutomationBackendMap";
import { migrateManualTrigger } from "./orderAutomationManualTrigger";

export type OrderAutomationRunResult = {
  effectsExecuted: string[];
  successMessage: string;
};

/** Blokada: ta sama (lub dowolna) akcja nie startuje ponownie, póki trwa wykonywanie. */
export function createExclusiveActivatorRunGate() {
  let busyKey: string | null = null;
  return {
    tryBegin(key: string): boolean {
      if (busyKey != null) return false;
      busyKey = key;
      return true;
    },
    end(key: string): void {
      if (busyKey === key) busyKey = null;
    },
    getBusyKey(): string | null {
      return busyKey;
    },
  };
}

export async function packingAutomationActivatorRules(
  tenantId: number,
  warehouseId: number,
): Promise<OrderAutomationRule[]> {
  const dtos = await listAutomations({ tenantId, warehouseId, entityType: "ORDER" });
  return dtos
    .map(backendRuleToFe)
    .filter((rule) => {
      if (!rule.enabled) return false;
      const mt = migrateManualTrigger(rule.manualTrigger);
      if (!mt.enabled) return false;
      if (mt.buttonEnabled === false) return false;
      return mt.visibleOnWmsPacking !== false;
    });
}

export function activatorButtonLabel(rule: OrderAutomationRule): string {
  const mt = migrateManualTrigger(rule.manualTrigger);
  return mt.label.trim() || rule.name.trim() || "Akcja";
}

/**
 * @deprecated FE effect executor — do not use. Runtime SSOT is backend /automations/{id}/run.
 * Kept as throw guard so accidental imports fail loudly.
 */
export async function executeOrderAutomationEffects(_opts: {
  tenantId: number;
  warehouseId: number;
  orderId: number;
  effects: unknown[];
}): Promise<string[]> {
  throw new Error(
    "executeOrderAutomationEffects is retired — use backend POST /automations/{id}/run",
  );
}

/** Uruchamia regułę z aktywatora przez backend Engine. */
export async function runOrderAutomationActivator(opts: {
  tenantId: number;
  warehouseId: number;
  orderId: number;
  rule: OrderAutomationRule;
  sourceLabel?: string;
}): Promise<OrderAutomationRunResult> {
  const label = activatorButtonLabel(opts.rule);
  const source = opts.sourceLabel ?? "pakowania WMS";
  const ruleId = Number(opts.rule.id);
  if (!Number.isFinite(ruleId) || ruleId <= 0) {
    throw new Error("Reguła nie ma identyfikatora backendowego.");
  }
  try {
    const result = await runAutomation(ruleId, {
      tenant_id: opts.tenantId,
      entity_type: "ORDER",
      entity_id: opts.orderId,
      check_conditions: Boolean(opts.rule.manualTrigger?.checkConditionsOnManualRun),
      dry_run: false,
    });
    const status = String(result.status || "");
    if (status === "SKIPPED") {
      throw new Error("Warunki reguły nie są spełnione.");
    }
    if (status === "FAILED") {
      throw new Error(String(result.error || "Nie udało się wykonać akcji."));
    }
    const effectsExecuted = (
      Array.isArray(result.planned_effects)
        ? (result.planned_effects as Array<{ effect_type?: string }>).map(
            (e) => String(e.effect_type || "effect"),
          )
        : ["ok"]
    );
    appendAutomationExecutionLog(opts.tenantId, opts.warehouseId, {
      id: newUid("log"),
      ts: new Date().toISOString(),
      ruleId: opts.rule.id,
      ruleName: opts.rule.name,
      level: "success",
      message: `Uruchomiono z ${source}`,
      orderId: String(opts.orderId),
      effectsExecuted,
      kind: "execution",
    });
    return {
      effectsExecuted,
      successMessage: `Wykonano: ${label}`,
    };
  } catch (e) {
    const fromApi = extractApiErrorMessage(e, "");
    const msg =
      fromApi.trim() ||
      (e instanceof Error && e.message.trim() ? e.message.trim() : "Nie udało się wykonać akcji.");
    appendAutomationExecutionLog(opts.tenantId, opts.warehouseId, {
      id: newUid("log"),
      ts: new Date().toISOString(),
      ruleId: opts.rule.id,
      ruleName: opts.rule.name,
      level: "error",
      message: msg,
      orderId: String(opts.orderId),
      kind: "execution",
    });
    throw new Error(msg);
  }
}
