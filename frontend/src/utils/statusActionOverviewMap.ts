/** Map AutomationRule DTO effects → overview row used by StatusActionsMatrix. */
import type { AutomationEffectDto, AutomationRuleDto, StatusActionOverviewEffectDto } from "../api/automationsApi";
import type { StatusActionManagedKey } from "./statusActionManagedCatalog";
import type { StatusActionsRowState } from "./statusActionMatrixPayload";

function managedKeyFromEffect(e: AutomationEffectDto): StatusActionManagedKey | null {
  const t = String(e.effect_type || "");
  if (t === "warehouse_commit") return "warehouse_commit";
  if (t === "generate_sale_correction" || t === "generate_correction") return "generate_sale_correction";
  if (t === "send_email" || t === "send_message") {
    const r = String(e.config?.recipient_type || "CUSTOMER").toUpperCase();
    return r === "INTERNAL" ? "send_email_internal" : "send_email_customer";
  }
  return null;
}

export function overviewRowFromRuleEffects(
  effects: AutomationEffectDto[] | undefined,
  ruleEnabled: boolean,
): Record<string, StatusActionOverviewEffectDto> {
  const out: Record<string, StatusActionOverviewEffectDto> = {};
  const ruleOn = Boolean(ruleEnabled);
  for (const e of effects ?? []) {
    const key = managedKeyFromEffect(e);
    if (!key || out[key]) continue;
    const entry: StatusActionOverviewEffectDto = {
      enabled: Boolean(e.enabled) && ruleOn,
    };
    const tid = Number(e.config?.template_id);
    if (Number.isFinite(tid) && tid > 0) entry.template_id = tid;
    const uid = Number(e.config?.user_id);
    if (Number.isFinite(uid) && uid > 0) entry.user_id = uid;
    if (key === "generate_sale_correction") {
      entry.include_shipping_cost = Boolean(e.config?.include_shipping_cost);
    }
    out[key] = entry;
  }
  return out;
}

export function overviewRowFromRule(rule: Pick<AutomationRuleDto, "enabled" | "effects">): Record<string, StatusActionOverviewEffectDto> {
  return overviewRowFromRuleEffects(rule.effects, rule.enabled);
}

export function rowStateFromOverviewMap(
  map: Record<string, StatusActionOverviewEffectDto> | undefined,
): StatusActionsRowState {
  if (!map) return {};
  const out: StatusActionsRowState = {};
  for (const [k, v] of Object.entries(map)) {
    out[k as StatusActionManagedKey] = {
      enabled: Boolean(v?.enabled),
      template_id: v?.template_id ?? null,
      user_id: v?.user_id ?? null,
      include_shipping_cost: Boolean(v?.include_shipping_cost),
    };
  }
  return out;
}
