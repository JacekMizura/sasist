/**
 * Single matrix cell: simple toggle (Magazyn/Korekta) or email checkbox + config popover.
 */
import { useState } from "react";

import type { AutomationEntityType } from "../../../api/automationsApi";
import {
  STATUS_ACTION_COLUMN_HEADERS,
  STATUS_ACTION_SIMPLE_TOGGLE_KEYS,
  type StatusActionManagedKey,
} from "../../../utils/statusActionManagedCatalog";
import type { StatusActionEffectState } from "../../../utils/statusActionMatrixPayload";
import { StatusEmailActionPopover } from "./StatusEmailActionPopover";

type Props = {
  actionKey: StatusActionManagedKey;
  state: StatusActionEffectState;
  disabled?: boolean;
  busy?: boolean;
  tenantId: number;
  warehouseId?: number | null;
  entityType: AutomationEntityType;
  onToggleSimple: (enabled: boolean) => void;
  onSaveEmail: (next: { enabled: true; template_id: number; user_id?: number }) => void;
  onDisableEmail: () => void;
};

function hasEmailConfig(actionKey: StatusActionManagedKey, state: StatusActionEffectState): boolean {
  const tid = Number(state.template_id);
  if (!Number.isFinite(tid) || tid <= 0) return false;
  if (actionKey === "send_email_internal") {
    const uid = Number(state.user_id);
    return Number.isFinite(uid) && uid > 0;
  }
  return true;
}

export function StatusActionCell({
  actionKey,
  state,
  disabled = false,
  busy = false,
  tenantId,
  warehouseId = null,
  entityType,
  onToggleSimple,
  onSaveEmail,
  onDisableEmail,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const checked = Boolean(state.enabled);
  const locked = disabled || busy;

  if (STATUS_ACTION_SIMPLE_TOGGLE_KEYS.has(actionKey)) {
    return (
      <td className="px-1 py-1.5 text-center align-middle">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 accent-emerald-600 disabled:opacity-40"
          checked={checked}
          disabled={locked}
          aria-label={STATUS_ACTION_COLUMN_HEADERS[actionKey]}
          onChange={(e) => onToggleSimple(e.target.checked)}
        />
      </td>
    );
  }

  const mode = actionKey === "send_email_internal" ? "internal" : "customer";
  const aria =
    actionKey === "send_email_internal" ? "E-mail wewnętrzny" : "E-mail klientowi";
  const configured = hasEmailConfig(actionKey, state);

  return (
    <td className="relative px-1 py-1.5 text-center align-middle">
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
        checked={checked}
        disabled={locked}
        aria-label={aria}
        readOnly
        onClick={(e) => {
          e.preventDefault();
          if (locked) return;
          if (checked) {
            // Configured ON → quick OFF (keep template_id / user_id in payload via patch enabled:false).
            onDisableEmail();
            setPopoverOpen(false);
            return;
          }
          if (configured) {
            onSaveEmail({
              enabled: true,
              template_id: Number(state.template_id),
              ...(mode === "internal" ? { user_id: Number(state.user_id) } : {}),
            });
            return;
          }
          setPopoverOpen(true);
        }}
      />
      <StatusEmailActionPopover
        open={popoverOpen && !locked}
        mode={mode}
        tenantId={tenantId}
        warehouseId={warehouseId}
        entityType={entityType}
        templateId={state.template_id && state.template_id > 0 ? state.template_id : ""}
        userId={state.user_id && state.user_id > 0 ? state.user_id : ""}
        busy={busy}
        showDisable={checked}
        onClose={() => setPopoverOpen(false)}
        onDisable={() => {
          setPopoverOpen(false);
          onDisableEmail();
        }}
        onSave={({ templateId, userId }) => {
          setPopoverOpen(false);
          onSaveEmail({
            enabled: true,
            template_id: templateId,
            ...(mode === "internal" && userId != null ? { user_id: userId } : {}),
          });
        }}
      />
    </td>
  );
}
