/** Build PUT /status-actions managed effects payload from matrix row state. */
import type { AutomationEffectDto, AutomationEntityType } from "../api/automationsApi";
import { managedKeysForEntity, type StatusActionManagedKey } from "./statusActionManagedCatalog";

export type StatusActionEffectState = {
  enabled: boolean;
  template_id?: number | null;
  user_id?: number | null;
};

export type StatusActionsRowState = Partial<Record<StatusActionManagedKey, StatusActionEffectState>>;

export function emptyEffectState(): StatusActionEffectState {
  return { enabled: false };
}

export function getEffectState(
  row: StatusActionsRowState | undefined,
  key: StatusActionManagedKey,
): StatusActionEffectState {
  return row?.[key] ?? emptyEffectState();
}

export function buildManagedEffectsPayload(
  entityType: AutomationEntityType,
  row: StatusActionsRowState,
): Omit<AutomationEffectDto, "id">[] {
  const keys = managedKeysForEntity(entityType);
  const out: Omit<AutomationEffectDto, "id">[] = [];
  for (const key of keys) {
    const st = getEffectState(row, key);
    if (key === "warehouse_commit") {
      out.push({
        position: out.length,
        effect_type: "warehouse_commit",
        enabled: Boolean(st.enabled),
        config: {},
      });
    } else if (key === "generate_sale_correction") {
      out.push({
        position: out.length,
        effect_type: "generate_sale_correction",
        enabled: Boolean(st.enabled),
        config: {},
      });
    } else if (key === "send_email_customer") {
      const tid = Number(st.template_id);
      out.push({
        position: out.length,
        effect_type: "send_email",
        enabled: Boolean(st.enabled),
        config: {
          recipient_type: "CUSTOMER",
          ...(Number.isFinite(tid) && tid > 0 ? { template_id: tid } : {}),
        },
      });
    } else if (key === "send_email_internal") {
      const tid = Number(st.template_id);
      const uid = Number(st.user_id);
      out.push({
        position: out.length,
        effect_type: "send_email",
        enabled: Boolean(st.enabled),
        config: {
          recipient_type: "INTERNAL",
          ...(Number.isFinite(tid) && tid > 0 ? { template_id: tid } : {}),
          ...(Number.isFinite(uid) && uid > 0 ? { user_id: uid } : {}),
        },
      });
    }
  }
  return out;
}

export function patchRowEffect(
  row: StatusActionsRowState,
  key: StatusActionManagedKey,
  patch: Partial<StatusActionEffectState>,
): StatusActionsRowState {
  return {
    ...row,
    [key]: { ...getEffectState(row, key), ...patch },
  };
}
