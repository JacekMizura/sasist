/**
 * Wykonanie reguł „Akcje automatyczne” — wspólny mechanizm dla aktywatorów (m.in. pakowanie WMS).
 * Reguły żyją w localStorage; efekty z realnym API idą przez istniejące endpointy (SSOT backendu dla statusu).
 */
import { extractApiErrorMessage } from "../api/apiErrorMessage";
import { patchOrderUiStatus } from "../api/orderUiStatusApi";
import type {
  AutomationEffect,
  AutomationEffectKind,
  OrderAutomationRule,
} from "../types/orderAutomation";
import { effectKindLabel } from "./orderAutomationCatalog";
import {
  appendAutomationExecutionLog,
  loadAutomationRules,
  newUid,
} from "./orderAutomationLocalStore";
import { migrateManualTrigger } from "./orderAutomationManualTrigger";

const UNSUPPORTED_EFFECT_MESSAGES: Record<Exclude<AutomationEffectKind, "change_status">, string> = {
  send_message: "Wysyłka wiadomości nie jest jeszcze dostępna w aktywatorach.",
  generate_document: "Generowanie dokumentu nie jest jeszcze dostępne w aktywatorach.",
  assign_courier: "Przypisanie kuriera nie jest jeszcze dostępne w aktywatorach.",
  add_tag: "Dodawanie tagu nie jest jeszcze dostępne w aktywatorach.",
  print: "Drukowanie nie jest jeszcze dostępne w aktywatorach.",
  wms_action: "Akcja WMS nie jest jeszcze dostępna w aktywatorach.",
};

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

export function packingAutomationActivatorRules(
  tenantId: number,
  warehouseId: number,
): OrderAutomationRule[] {
  return loadAutomationRules(tenantId, warehouseId, "orders").filter((rule) => {
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

function polishApiError(err: unknown, fallback: string): Error {
  const fromApi = extractApiErrorMessage(err, "");
  if (fromApi.trim()) return new Error(fromApi.trim());
  if (err instanceof Error && err.message.trim()) return new Error(err.message.trim());
  return new Error(fallback);
}

async function executeEffect(opts: {
  tenantId: number;
  warehouseId: number;
  orderId: number;
  effect: AutomationEffect;
}): Promise<string> {
  const { effect } = opts;
  switch (effect.kind) {
    case "change_status": {
      const raw = effect.payload.order_ui_status_id;
      const statusId = Number(raw);
      if (!Number.isFinite(statusId) || statusId <= 0) {
        throw new Error("Brak statusu w akcji automatycznej.");
      }
      try {
        await patchOrderUiStatus(opts.orderId, opts.tenantId, opts.warehouseId, statusId);
      } catch (e) {
        throw polishApiError(e, "Nie udało się zmienić statusu zamówienia.");
      }
      return `change_status→${statusId}`;
    }
    default: {
      const msg =
        UNSUPPORTED_EFFECT_MESSAGES[effect.kind as Exclude<AutomationEffectKind, "change_status">] ??
        `Akcja „${effectKindLabel(effect.kind)}” nie jest jeszcze dostępna.`;
      throw new Error(msg);
    }
  }
}

/** Wykonuje efekty reguły na zamówieniu (bez logów / potwierdzeń UI). */
export async function executeOrderAutomationEffects(opts: {
  tenantId: number;
  warehouseId: number;
  orderId: number;
  effects: AutomationEffect[];
}): Promise<string[]> {
  const effects = opts.effects ?? [];
  if (effects.length === 0) {
    throw new Error("Reguła nie ma skonfigurowanych akcji do wykonania.");
  }
  const executed: string[] = [];
  for (const effect of effects) {
    executed.push(
      await executeEffect({
        tenantId: opts.tenantId,
        warehouseId: opts.warehouseId,
        orderId: opts.orderId,
        effect,
      }),
    );
  }
  return executed;
}

/** Uruchamia regułę z aktywatora i zapisuje wpis w lokalnym dzienniku wykonań. */
export async function runOrderAutomationActivator(opts: {
  tenantId: number;
  warehouseId: number;
  orderId: number;
  rule: OrderAutomationRule;
  sourceLabel?: string;
}): Promise<OrderAutomationRunResult> {
  const label = activatorButtonLabel(opts.rule);
  const source = opts.sourceLabel ?? "pakowania WMS";
  try {
    const effectsExecuted = await executeOrderAutomationEffects({
      tenantId: opts.tenantId,
      warehouseId: opts.warehouseId,
      orderId: opts.orderId,
      effects: opts.rule.effects ?? [],
    });
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
    const msg =
      e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "Nie udało się wykonać akcji.";
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
