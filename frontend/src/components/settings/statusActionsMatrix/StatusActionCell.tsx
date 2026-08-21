/**
 * Single matrix cell: warehouse toggle or email checkbox + config popover.
 */
import { useState } from "react";

import type { AutomationEntityType } from "../../../api/automationsApi";
import type { StatusActionManagedKey } from "../../../utils/statusActionManagedCatalog";
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
  onToggleWarehouse: (enabled: boolean) => void;
  onSaveEmail: (next: { enabled: true; template_id: number; user_id?: number }) => void;
  onDisableEmail: () => void;
};

export function StatusActionCell({
  actionKey,
  state,
  disabled = false,
  busy = false,
  tenantId,
  warehouseId = null,
  entityType,
  onToggleWarehouse,
  onSaveEmail,
  onDisableEmail,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const checked = Boolean(state.enabled);
  const locked = disabled || busy;

  if (actionKey === "warehouse_commit") {
    return (
      <td className="px-2 py-2 text-center align-middle">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 accent-emerald-600 disabled:opacity-40"
          checked={checked}
          disabled={locked}
          aria-label="Przyjęcie magazynowe"
          onChange={(e) => onToggleWarehouse(e.target.checked)}
        />
      </td>
    );
  }

  const mode = actionKey === "send_email_internal" ? "internal" : "customer";
  const aria =
    actionKey === "send_email_internal" ? "E-mail wewnętrzny" : "E-mail klientowi";

  return (
    <td className="relative px-2 py-2 text-center align-middle">
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
