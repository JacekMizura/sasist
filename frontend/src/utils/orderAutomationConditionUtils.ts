import type { AutomationCondition, AutomationConditionOp } from "../types/orderAutomation";
import { ORDER_AUTOMATION_CONDITION_FIELDS } from "./orderAutomationCatalog";

/** Pola obsługujące wybór wielu wartości (operator in / not_in). */
export const MULTI_VALUE_CONDITION_FIELD_KEYS = new Set([
  "order_status",
  "order_source",
  "shipment_courier",
  "shipment_status",
  "payment_method",
  "warehouse_id",
  "order_tags",
  "order_categories",
]);

export function isMultiValueConditionField(fieldKey: string): boolean {
  return MULTI_VALUE_CONDITION_FIELD_KEYS.has(fieldKey);
}

export function migrateConditionValue(value: string | string[] | undefined | null): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

export function migrateConditionOperator(fieldKey: string, operator: AutomationConditionOp): AutomationConditionOp {
  if (isMultiValueConditionField(fieldKey)) {
    if (operator === "eq" || operator === "in") return "in";
    if (operator === "neq" || operator === "not_in") return "not_in";
    return "in";
  }
  if (operator === "in") return "eq";
  if (operator === "not_in") return "neq";
  return operator;
}

export function normalizeCondition(c: AutomationCondition): AutomationCondition {
  const value = migrateConditionValue(c.value as string | string[]);
  const operator = migrateConditionOperator(c.fieldKey, c.operator);
  return { ...c, value, operator };
}

export function defaultOperatorsForField(fieldKey: string): AutomationConditionOp[] {
  if (isMultiValueConditionField(fieldKey)) {
    return ["in", "not_in"];
  }
  const def = ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === fieldKey);
  if (def?.valueKind === "number") return ["eq", "neq"];
  return ["eq", "neq", "contains"];
}

export function defaultOperatorForField(fieldKey: string): AutomationConditionOp {
  return defaultOperatorsForField(fieldKey)[0] ?? "eq";
}
