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

/** Części warunku do chipów na liście (pole + operator + wartość). */
export function formatConditionDisplayParts(
  c: AutomationCondition,
  statusNameById?: Map<number, string>,
): { field: string; op: string; value: string } {
  const field = conditionFieldLabel(c.fieldKey);
  const op = ORDER_AUTOMATION_OPERATOR_UI[c.operator] ?? ORDER_AUTOMATION_OPERATOR_LABELS[c.operator] ?? c.operator;
  let value = c.value || "—";
  if (c.fieldKey === "order_status" && statusNameById) {
    const id = Number(c.value);
    if (Number.isFinite(id) && statusNameById.has(id)) value = statusNameById.get(id)!;
  }
  return { field, op, value };
}

export function formatRuleDisplayId(rule: Pick<OrderAutomationRule, "id" | "publicId">): string {
  if (typeof rule.publicId === "number" && rule.publicId > 0) {
    return `#${rule.publicId}`;
  }
  const tail = rule.id.replace(/^rule_/, "").slice(0, 8);
  return tail ? `#${tail}` : rule.id;
}

/** Główny tytuł workflow na liście (np. „Nowe → Pakowanie”). */
export function formatRuleWorkflowTitle(
  rule: Pick<OrderAutomationRule, "conditions" | "effects">,
  statusNameById?: Map<number, string>,
): string {
  const statusCond = rule.conditions.find((c) => c.fieldKey === "order_status");
  let from = "—";
  if (statusCond) {
    from = formatConditionDisplayParts(statusCond, statusNameById).value;
  } else if (rule.conditions[0]) {
    const p = formatConditionDisplayParts(rule.conditions[0], statusNameById);
    from = p.value !== "—" ? p.value : p.field;
  }

  const statusEff = rule.effects.find((e) => e.kind === "change_status");
  let to = "—";
  if (statusEff) {
    const id = Number(statusEff.payload.order_ui_status_id);
    const name = Number.isFinite(id) && statusNameById?.get(id);
    to = name ?? `#${statusEff.payload.order_ui_status_id ?? "?"}`;
  } else if (rule.effects[0]) {
    to = formatEffectPill(rule.effects[0], statusNameById);
  }

  if (from === "—" && to === "—") return "—";
  return `${from} → ${to}`;
}

export function formatDelayMinutes(minutes: number | undefined | null): string {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  return `${m} min`;
}

export type ExecutionModeKind = "automatic" | "schedule" | "manual";

export function resolveExecutionMode(rule: Pick<OrderAutomationRule, "execution" | "manualTrigger">): ExecutionModeKind {
  if (rule.execution.onSchedule) return "schedule";
  if (rule.execution.onOrderCreated || rule.execution.onStatusChanged) return "automatic";
  if (rule.manualTrigger.enabled) return "manual";
  return "manual";
}

export function formatExecutionModeBadge(
  rule: Pick<OrderAutomationRule, "enabled" | "execution" | "manualTrigger">,
): { label: string; className: string } {
  const mode = resolveExecutionMode(rule);
  if (mode === "schedule") {
    return { label: "Harmonogram", className: "border-blue-200 bg-blue-50 text-blue-800" };
  }
  if (mode === "automatic") {
    const prefix = rule.enabled ? "✓ " : "";
    return { label: `${prefix}Automatycznie`, className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  return { label: "Ręcznie", className: "border-slate-200 bg-white text-slate-600" };
}

export function formatEffectsSummary(
  effects: AutomationEffect[],
  statusNameById?: Map<number, string>,
): { short: string; full: string } {
  if (effects.length === 0) return { short: "—", full: "—" };
  const lines = effects.map((e) => formatEffectPill(e, statusNameById));
  if (effects.length === 1) {
    return { short: lines[0]!, full: lines[0]! };
  }
  return { short: `${effects.length} akcje`, full: lines.join("\n") };
}

export function compareRulesByPublicId(a: OrderAutomationRule, b: OrderAutomationRule, dir: "asc" | "desc"): number {
  const da = typeof a.publicId === "number" && a.publicId > 0 ? a.publicId : Number.MAX_SAFE_INTEGER;
  const db = typeof b.publicId === "number" && b.publicId > 0 ? b.publicId : Number.MAX_SAFE_INTEGER;
  return dir === "asc" ? da - db : db - da;
}

export function primaryTriggerLabel(r: Pick<OrderAutomationRule, "execution" | "manualTrigger">): string {
  const parts: string[] = [];
  if (r.execution.onOrderCreated) parts.push("Po utworzeniu");
  if (r.execution.onStatusChanged) parts.push("Zmiana statusu");
  if (r.execution.onSchedule) parts.push("Harmonogram");
  if (r.manualTrigger.enabled) parts.push("Przycisk ręczny");
  return parts.join(" · ") || "—";
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
