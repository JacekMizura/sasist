import type { AutomationCondition, AutomationEffect, OrderAutomationRule } from "../types/orderAutomation";
import { conditionFieldLabel, effectKindLabel } from "./orderAutomationCatalog";
import { migrateExecution, normalizeExecution } from "./orderAutomationExecution";

function parseTimeMinutes(raw: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  const [h, m] = raw.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function isScheduleWindowValid(
  runMode: OrderAutomationRule["execution"]["runMode"],
  windowFrom: string,
  windowTo: string,
): boolean {
  if (runMode === "continuous") return true;
  const from = parseTimeMinutes(windowFrom);
  const to = parseTimeMinutes(windowTo);
  if (from == null || to == null) return false;
  return to > from;
}

export function validateCondition(c: AutomationCondition): string | null {
  if (!String(c.value ?? "").trim()) {
    return "Brak wybranej wartości";
  }
  if (c.fieldKey === "order_status") {
    const id = Number(c.value);
    if (!Number.isFinite(id) || id <= 0) {
      return "Brak wybranej wartości";
    }
  }
  return null;
}

export function validateEffect(e: AutomationEffect): string | null {
  switch (e.kind) {
    case "change_status": {
      const id = Number(e.payload.order_ui_status_id);
      if (!Number.isFinite(id) || id <= 0) return "Brak wybranego statusu";
      return null;
    }
    case "generate_document": {
      if (!String(e.payload.doc_type ?? "").trim()) return "Nie wybrano typu dokumentu";
      return null;
    }
    case "send_message": {
      if (!String(e.payload.template ?? "").trim()) return "Nie wybrano szablonu wiadomości";
      return null;
    }
    case "assign_courier": {
      const courier = String(e.payload.courier ?? "").trim();
      const preset = String(e.payload.courier_preset ?? "").trim();
      if (!courier && !preset) return "Nie wybrano przewoźnika";
      return null;
    }
    case "add_tag": {
      if (!String(e.payload.tag ?? "").trim()) return "Brak nazwy tagu";
      return null;
    }
    case "print": {
      const doc = String(e.payload.print_document ?? "").trim() || String(e.payload.template ?? "").trim();
      if (!doc) return "Nie wybrano dokumentu do druku";
      return null;
    }
    case "wms_action": {
      if (!String(e.payload.action_key ?? "").trim()) return "Nie wybrano akcji WMS";
      return null;
    }
    default:
      return null;
  }
}

export type AutomationValidationResult = {
  valid: boolean;
  messages: string[];
  conditionErrors: Record<string, string>;
  effectErrors: Record<string, string>;
};

export function validateAutomationRule(rule: OrderAutomationRule): AutomationValidationResult {
  const messages: string[] = [];
  const conditionErrors: Record<string, string> = {};
  const effectErrors: Record<string, string> = {};

  const execution = normalizeExecution(migrateExecution(rule.execution, rule.manualTrigger));
  const automatic = execution.automatic;
  const manual = Boolean(rule.manualTrigger?.enabled);

  if (!automatic && !manual) {
    messages.push("Brak sposobu uruchamiania — włącz automatyczne lub ręczne");
  }

  if (rule.conditions.length === 0) {
    messages.push("Brak warunków — dodaj co najmniej jeden warunek");
  }

  rule.conditions.forEach((c, idx) => {
    const err = validateCondition(c);
    if (err) {
      conditionErrors[c.uid] = err;
      messages.push(`Warunek ${idx + 1} – ${err.toLowerCase()}`);
    }
  });

  if (rule.effects.length === 0) {
    messages.push("Brak efektów — dodaj co najmniej jedną akcję");
  }

  rule.effects.forEach((e, idx) => {
    const err = validateEffect(e);
    if (err) {
      effectErrors[e.uid] = err;
      const label = effectKindLabel(e.kind);
      messages.push(`Efekt ${idx + 1} (${label}) – ${err.charAt(0).toLowerCase()}${err.slice(1)}`);
    }
  });

  if (automatic && !isScheduleWindowValid(execution.runMode, execution.windowFrom, execution.windowTo)) {
    messages.push("Harmonogram – godzina końcowa musi być większa od początkowej");
  }

  if (automatic && execution.runMode === "days_and_hours" && execution.activeDays.length === 0) {
    messages.push("Harmonogram – wybierz co najmniej jeden dzień tygodnia");
  }

  return {
    valid: messages.length === 0,
    messages,
    conditionErrors,
    effectErrors,
  };
}

export function conditionErrorTitle(c: AutomationCondition): string {
  return conditionFieldLabel(c.fieldKey);
}

export function effectErrorTitle(e: AutomationEffect): string {
  if (e.kind === "send_message" && String(e.payload.message_channel ?? "email") === "email") {
    return "Wyślij e-mail";
  }
  return effectKindLabel(e.kind);
}
