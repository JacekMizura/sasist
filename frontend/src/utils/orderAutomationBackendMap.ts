/**
 * Map FE OrderAutomationRule ↔ backend AutomationRuleDto (SSOT).
 */
import type { AutomationCondition, AutomationEffect, OrderAutomationRule } from "../types/orderAutomation";
import type { AutomationEffectDto, AutomationRuleCreateBody, AutomationRuleDto } from "../api/automationsApi";
import { defaultExecution, migrateExecution, normalizeExecution } from "./orderAutomationExecution";
import { defaultManualTrigger, migrateManualTrigger } from "./orderAutomationManualTrigger";
import { normalizeCondition } from "./orderAutomationConditionUtils";

export function backendRuleToFe(dto: AutomationRuleDto): OrderAutomationRule {
  const meta = (dto.metadata ?? {}) as Record<string, unknown>;
  const conditionsRaw = Array.isArray(dto.conditions) ? dto.conditions : [];
  const conditions: AutomationCondition[] = conditionsRaw.map((c, i) => {
    const n = normalizeCondition(c as AutomationCondition);
    return {
      ...n,
      joinToNext: i < conditionsRaw.length - 1 ? (n.joinToNext ?? "and") : undefined,
    };
  });
  const effects: AutomationEffect[] = (dto.effects ?? []).map((e, i) => {
    const kindRaw = String(e.effect_type || "");
    const kind = (
      kindRaw === "send_message"
        ? "send_email"
        : kindRaw === "generate_correction"
          ? "generate_sale_correction"
          : kindRaw
    ) as AutomationEffect["kind"];
    return {
      uid: e.id != null ? `eff-${e.id}` : `eff-pos-${i}`,
      kind,
      payload: { ...(e.config ?? {}) } as AutomationEffect["payload"],
    };
  });
  const manualTrigger = migrateManualTrigger(
    (meta.manualTrigger as OrderAutomationRule["manualTrigger"]) ?? defaultManualTrigger(),
  );
  const execution = normalizeExecution(
    migrateExecution(
      (meta.execution as OrderAutomationRule["execution"]) ?? undefined,
      manualTrigger,
    ),
  );
  const statsRaw = (meta.stats as OrderAutomationRule["stats"]) ?? { lastRunAt: null, runCount: 0 };
  const tc = (dto.trigger_config ?? {}) as Record<string, unknown>;
  let triggerStatusId: number | null = null;
  const rawSid = tc.status_id ?? (Array.isArray(tc.status_ids) ? tc.status_ids[0] : null);
  const nSid = Number(rawSid);
  if (Number.isFinite(nSid) && nSid > 0) triggerStatusId = nSid;
  return {
    id: String(dto.id),
    publicId: typeof meta.publicId === "number" ? meta.publicId : dto.id,
    name: dto.name,
    group: dto.group || "Ogólne",
    enabled: dto.enabled,
    manualTrigger,
    conditions,
    effects,
    execution,
    delayMinutes: Math.max(0, Math.floor(Number(meta.delayMinutes) || 0)),
    stats: {
      lastRunAt: statsRaw.lastRunAt ?? null,
      runCount: Number(statsRaw.runCount) || 0,
    },
    source: dto.source,
    entityType: String(dto.entity_type || "ORDER").toUpperCase(),
    triggerStatusId,
  };
}

function statusIdsFromConditions(conditions: AutomationCondition[]): number[] {
  const ids: number[] = [];
  for (const c of conditions) {
    if (c.fieldKey !== "order_status") continue;
    if (c.operator !== "in" && c.operator !== "eq") continue;
    for (const v of c.value ?? []) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) ids.push(n);
    }
  }
  return [...new Set(ids)];
}

export function feRuleToCreateBody(
  rule: OrderAutomationRule,
  opts: { tenantId: number; warehouseId: number; source?: string },
): AutomationRuleCreateBody {
  const effects: Omit<AutomationEffectDto, "id">[] = (rule.effects ?? []).map((e, i) => {
    const config: Record<string, unknown> = { ...(e.payload ?? {}) };
    let effectType: string = e.kind;
    if (e.kind === "change_status") {
      const sid = Number(config.status_id ?? config.order_ui_status_id);
      if (Number.isFinite(sid) && sid > 0) {
        config.status_id = sid;
        config.order_ui_status_id = sid;
      }
    }
    if (e.kind === "send_email" || e.kind === "send_message") {
      effectType = "send_email";
      const tid = Number(config.template_id ?? config.template);
      if (Number.isFinite(tid) && tid > 0) config.template_id = tid;
      const rtype = String(config.recipient_type || "CUSTOMER").toUpperCase();
      config.recipient_type = rtype === "INTERNAL" ? "INTERNAL" : "CUSTOMER";
      if (config.recipient_type === "INTERNAL") {
        const uid = Number(config.user_id);
        if (Number.isFinite(uid) && uid > 0) config.user_id = uid;
      } else {
        delete config.user_id;
      }
      delete config.template;
      delete config.message_channel;
      delete config.delay_min;
    }
    if (e.kind === "warehouse_commit") {
      effectType = "warehouse_commit";
    }
    if (e.kind === "generate_sale_correction") {
      effectType = "generate_sale_correction";
    }
    return {
      position: i,
      effect_type: effectType,
      config,
      enabled: true,
    };
  });
  const statusIds = statusIdsFromConditions(rule.conditions ?? []);
  return {
    tenant_id: opts.tenantId,
    warehouse_id: opts.warehouseId,
    entity_type: String(rule.entityType || "ORDER").toUpperCase(),
    name: rule.name,
    group: rule.group || "Ogólne",
    enabled: rule.enabled,
    trigger_type: "entity_status_entered",
    trigger_config: statusIds.length ? { status_ids: statusIds } : {},
    conditions: rule.conditions ?? [],
    metadata: {
      publicId: rule.publicId,
      manualTrigger: rule.manualTrigger,
      execution: rule.execution ?? defaultExecution(),
      delayMinutes: rule.delayMinutes ?? 0,
      stats: rule.stats ?? { lastRunAt: null, runCount: 0 },
      legacy_fe_id: rule.id.startsWith("rule") || rule.id.includes("-") ? rule.id : undefined,
    },
    source: opts.source ?? "USER_AUTOMATION",
    effects,
  };
}

export function feRuleToUpdateBody(rule: OrderAutomationRule): Partial<AutomationRuleCreateBody> {
  const base = feRuleToCreateBody(rule, { tenantId: 0, warehouseId: 0 });
  return {
    name: base.name,
    group: base.group,
    enabled: base.enabled,
    trigger_type: base.trigger_type,
    trigger_config: base.trigger_config,
    conditions: base.conditions,
    metadata: {
      publicId: rule.publicId,
      manualTrigger: rule.manualTrigger,
      execution: rule.execution ?? defaultExecution(),
      delayMinutes: rule.delayMinutes ?? 0,
      stats: rule.stats ?? { lastRunAt: null, runCount: 0 },
    },
    effects: base.effects,
  };
}

/** Source badge for list UI. */
export function automationSourceBadge(source: string | undefined): string | null {
  const s = (source || "").toUpperCase();
  if (s === "STATUS_ACTION") return "Akcja statusu";
  if (s === "USER_AUTOMATION" || s === "USER") return null;
  if (s === "SYSTEM") return "System";
  return s || null;
}
