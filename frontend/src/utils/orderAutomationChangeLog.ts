import type {
  AutomationCondition,
  AutomationEffect,
  OrderAutomationChangeLogEntry,
  OrderAutomationChangeType,
  OrderAutomationRule,
} from "../types/orderAutomation";
import { conditionFieldLabel, effectKindLabel } from "./orderAutomationCatalog";
import {
  conditionOptionsForField,
  resolveOptionLabels,
  type ConditionOption,
} from "./orderAutomationConditionOptions";
import { normalizeCondition } from "./orderAutomationConditionUtils";
import { formatConditionValuesDisplay } from "./orderAutomationPreview";
import { newUid } from "./orderAutomationLocalStore";

export type ChangeLogContext = {
  statusOptions: ConditionOption[];
  warehouseOptions: ConditionOption[];
};

function entry(
  ruleId: string,
  type: OrderAutomationChangeType,
  field: string,
  before: string | null,
  after: string | null,
  userId: number,
  userName: string,
): OrderAutomationChangeLogEntry {
  return {
    id: newUid("chg"),
    ruleId,
    type,
    field,
    before,
    after,
    userId,
    userName,
    createdAt: new Date().toISOString(),
  };
}

function fmtCond(c: AutomationCondition, ctx: ChangeLogContext): string {
  return formatConditionValuesDisplay(normalizeCondition(c), {
    statusNameById: new Map(
      ctx.statusOptions.map((o) => [Number(o.value), o.label]).filter(([id]) => Number.isFinite(id)),
    ),
    warehouseOptions: ctx.warehouseOptions,
  });
}

function fmtEffect(e: AutomationEffect): string {
  return effectKindLabel(e.kind);
}

function pushFieldChange(
  out: OrderAutomationChangeLogEntry[],
  ruleId: string,
  label: string,
  before: string | null | undefined,
  after: string | null | undefined,
  userId: number,
  userName: string,
) {
  const b = before ?? null;
  const a = after ?? null;
  if (b === a) return;
  out.push(entry(ruleId, "field_updated", label, b, a, userId, userName));
}

/** Oblicza diff konfiguracji reguły do historii zmian. */
export function computeRuleChangeLogEntries(
  before: OrderAutomationRule | null,
  after: OrderAutomationRule,
  userId: number,
  userName: string,
  ctx: ChangeLogContext,
): OrderAutomationChangeLogEntry[] {
  const out: OrderAutomationChangeLogEntry[] = [];
  const ruleId = after.id;

  if (!before) {
    out.push(entry(ruleId, "rule_created", "Reguła", null, after.name, userId, userName));
    pushFieldChange(out, ruleId, "Nazwa", null, after.name, userId, userName);
    pushFieldChange(out, ruleId, "Grupa", null, after.group, userId, userName);
    after.conditions.forEach((c, i) => {
      out.push(
        entry(
          ruleId,
          "condition_added",
          conditionFieldLabel(c.fieldKey),
          null,
          fmtCond(c, ctx),
          userId,
          userName,
        ),
      );
    });
    after.effects.forEach((e) => {
      out.push(entry(ruleId, "effect_added", effectKindLabel(e.kind), null, fmtEffect(e), userId, userName));
    });
    return out;
  }

  pushFieldChange(out, ruleId, "Nazwa", before.name, after.name, userId, userName);
  pushFieldChange(out, ruleId, "Grupa", before.group, after.group, userId, userName);
  pushFieldChange(out, ruleId, "Aktywna", before.enabled ? "Tak" : "Nie", after.enabled ? "Tak" : "Nie", userId, userName);

  const beforeConds = new Map(before.conditions.map((c) => [c.uid, normalizeCondition(c)]));
  const afterConds = new Map(after.conditions.map((c) => [c.uid, normalizeCondition(c)]));

  for (const [uid, c] of afterConds) {
    const prev = beforeConds.get(uid);
    const label = conditionFieldLabel(c.fieldKey);
    if (!prev) {
      out.push(entry(ruleId, "condition_added", label, null, fmtCond(c, ctx), userId, userName));
      continue;
    }
    const prevVal = fmtCond(prev, ctx);
    const nextVal = fmtCond(c, ctx);
    if (prevVal !== nextVal || prev.operator !== c.operator) {
      out.push(entry(ruleId, "condition_updated", label, prevVal, nextVal, userId, userName));
    }
  }
  for (const [uid, c] of beforeConds) {
    if (!afterConds.has(uid)) {
      out.push(entry(ruleId, "condition_removed", conditionFieldLabel(c.fieldKey), fmtCond(c, ctx), null, userId, userName));
    }
  }

  const beforeEff = new Map(before.effects.map((e) => [e.uid, e]));
  const afterEff = new Map(after.effects.map((e) => [e.uid, e]));

  for (const [uid, e] of afterEff) {
    const prev = beforeEff.get(uid);
    const label = effectKindLabel(e.kind);
    if (!prev) {
      out.push(entry(ruleId, "effect_added", label, null, fmtEffect(e), userId, userName));
    }
  }
  for (const [uid, e] of beforeEff) {
    if (!afterEff.has(uid)) {
      out.push(entry(ruleId, "effect_removed", effectKindLabel(e.kind), fmtEffect(e), null, userId, userName));
    }
  }

  return out;
}

export function buildChangeLogContext(args: {
  statusNameById: Map<number, string>;
  warehouses: Array<{ id: number; name: string }>;
}): ChangeLogContext {
  const statusOptions: ConditionOption[] = [];
  for (const [id, name] of args.statusNameById) {
    statusOptions.push({ value: String(id), label: name });
  }
  const warehouseOptions: ConditionOption[] = args.warehouses.map((w) => ({
    value: String(w.id),
    label: w.name,
  }));
  return { statusOptions, warehouseOptions };
}
