import type { AutomationCondition, AutomationEffect, OrderAutomationRule } from "../types/orderAutomation";
import { ORDER_AUTOMATION_OPERATOR_LABELS, ORDER_AUTOMATION_OPERATOR_UI, conditionFieldLabel, effectKindLabel } from "./orderAutomationCatalog";

export function formatConditionPill(c: AutomationCondition, statusNameById?: Map<number, string>): string {
  const field = conditionFieldLabel(c.fieldKey);
  const op = ORDER_AUTOMATION_OPERATOR_UI[c.operator] ?? ORDER_AUTOMATION_OPERATOR_LABELS[c.operator] ?? c.operator;
  let val = c.value || "—";
  if (c.fieldKey === "order_status" && statusNameById) {
    const id = Number(c.value);
    if (Number.isFinite(id) && statusNameById.has(id)) val = statusNameById.get(id)!;
  }
  return `${field} ${op} ${val}`;
}

export function formatEffectPill(e: AutomationEffect, statusNameById?: Map<number, string>): string {
  const base = effectKindLabel(e.kind);
  if (e.kind === "change_status") {
    const id = Number(e.payload.order_ui_status_id);
    const name = Number.isFinite(id) && statusNameById?.get(id);
    return name ? `${base} → ${name}` : `${base} → #${e.payload.order_ui_status_id ?? "?"}`;
  }
  if (e.kind === "send_message") return `${base}: ${String(e.payload.template ?? "szablon")}`;
  if (e.kind === "assign_courier") return `${base}: ${String(e.payload.courier ?? "—")}`;
  if (e.kind === "add_tag") return `${base}: ${String(e.payload.tag ?? "—")}`;
  return base;
}

/** Krótki token do tabeli / chipów (np. „Status = Nowe”). */
export function formatConditionChipShort(c: AutomationCondition, statusNameById?: Map<number, string>): string {
  const field = conditionFieldLabel(c.fieldKey);
  let val = c.value || "—";
  if (c.fieldKey === "order_status" && statusNameById) {
    const id = Number(c.value);
    if (Number.isFinite(id) && statusNameById.has(id)) val = statusNameById.get(id)!;
  }
  return `${field} = ${val}`;
}

export function formatEffectChipShort(e: AutomationEffect, statusNameById?: Map<number, string>): string {
  if (e.kind === "change_status") {
    const id = Number(e.payload.order_ui_status_id);
    const name = Number.isFinite(id) && statusNameById?.get(id);
    return name ? `→ ${name}` : `→ #${e.payload.order_ui_status_id ?? "?"}`;
  }
  return formatEffectPill(e, statusNameById);
}

/** Jedna linia podglądu z ORAZ / LUB między warunkami. */
export function formatAutomationSentencePl(
  rule: Pick<OrderAutomationRule, "conditions" | "effects">,
  statusNameById?: Map<number, string>,
): { ifLine: string; thenLine: string } {
  let ifLine = "";
  rule.conditions.forEach((c, i) => {
    const part = formatConditionChipShort(c, statusNameById);
    if (i > 0) {
      const j = rule.conditions[i - 1]?.joinToNext === "or" ? " LUB " : " ORAZ ";
      ifLine += j;
    }
    ifLine += `[${part}]`;
  });
  const thenLine = rule.effects.map((e) => `[${formatEffectPill(e, statusNameById)}]`).join(" ");
  return {
    ifLine: ifLine || "—",
    thenLine: thenLine || "—",
  };
}
