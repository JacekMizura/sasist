/**
 * Sellasist-like editable STATUS_ACTION matrix within one subgroup.
 * List and modal share AutomationRule SSOT — no local boolean SSOT.
 */
import { useCallback, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import {
  upsertStatusActions,
  type AutomationEntityType,
  type StatusActionOverviewEffectDto,
} from "../../../api/automationsApi";
import { IconButton } from "../../../design-system";
import { SettingInfoButton } from "../../../pages/Settings/SettingInfoButton";
import {
  STATUS_ACTION_COLUMN_HEADERS,
  STATUS_ACTION_COLUMN_TOOLTIPS,
  managedKeysForEntity,
} from "../../../utils/statusActionManagedCatalog";
import {
  buildManagedEffectsPayload,
  getEffectState,
  patchRowEffect,
  type StatusActionsRowState,
} from "../../../utils/statusActionMatrixPayload";
import { overviewRowFromRule, rowStateFromOverviewMap } from "../../../utils/statusActionOverviewMap";
import { StatusActionCell } from "./StatusActionCell";

export type StatusMatrixRow = {
  id: number;
  name: string;
  count?: number;
  is_active?: boolean;
  badge_color?: string | null;
  color?: string | null;
};

type Props = {
  tenantId: number;
  warehouseId?: number | null;
  entityType: AutomationEntityType;
  statuses: StatusMatrixRow[];
  actionsByStatusId: Record<string, Record<string, StatusActionOverviewEffectDto>>;
  canWrite?: boolean;
  onEditStatus: (statusId: number) => void;
  onDeleteStatus?: (statusId: number) => void;
  /** Immediate reconciliation from PUT response (before overview refetch). */
  onActionsPatched: (statusId: number, row: Record<string, StatusActionOverviewEffectDto>) => void;
  onOverviewChanged: () => void | Promise<void>;
};

export function StatusActionsMatrix({
  tenantId,
  warehouseId = null,
  entityType,
  statuses,
  actionsByStatusId,
  canWrite = true,
  onEditStatus,
  onDeleteStatus,
  onActionsPatched,
  onOverviewChanged,
}: Props) {
  const keys = managedKeysForEntity(entityType);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, StatusActionsRowState>>({});

  const resolveRow = useCallback(
    (statusId: number): StatusActionsRowState => {
      const sid = String(statusId);
      return optimistic[sid] ?? rowStateFromOverviewMap(actionsByStatusId[sid]);
    },
    [actionsByStatusId, optimistic],
  );

  const persistRow = async (status: StatusMatrixRow, next: StatusActionsRowState) => {
    const sid = String(status.id);
    setOptimistic((prev) => ({ ...prev, [sid]: next }));
    setBusyId(status.id);
    try {
      const saved = await upsertStatusActions({
        tenant_id: tenantId,
        entity_type: entityType,
        status_id: status.id,
        warehouse_id: warehouseId,
        status_name: status.name,
        effects: buildManagedEffectsPayload(entityType, next),
      });
      // Reconcile from PUT first — do not depend solely on overview timing.
      onActionsPatched(status.id, overviewRowFromRule(saved));
      try {
        await onOverviewChanged();
      } catch {
        // Keep patched state; overview failure must not wipe the row.
      }
      setOptimistic((prev) => {
        const copy = { ...prev };
        delete copy[sid];
        return copy;
      });
    } catch {
      toast.error("Nie udało się zapisać akcji statusu");
      setOptimistic((prev) => {
        const copy = { ...prev };
        delete copy[sid];
        return copy;
      });
    } finally {
      setBusyId(null);
    }
  };

  if (statuses.length === 0) {
    return <p className="py-2 text-xs italic text-slate-400">Brak etykiet</p>;
  }

  return (
    <div className="w-full overflow-x-auto border-t border-slate-100">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[11px] font-semibold text-slate-500">
            <th className="px-2 py-1.5 font-semibold text-slate-600">Status</th>
            {keys.map((key) => (
              <th
                key={key}
                className="w-24 px-1 py-1.5 text-center font-semibold text-slate-600"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  {STATUS_ACTION_COLUMN_HEADERS[key]}
                  <SettingInfoButton
                    title={STATUS_ACTION_COLUMN_HEADERS[key]}
                    description={STATUS_ACTION_COLUMN_TOOLTIPS[key]}
                  />
                </span>
              </th>
            ))}
            <th className="w-16 px-1 py-1.5 text-center font-semibold text-slate-600">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((status) => {
            const inactive = status.is_active === false;
            const row = resolveRow(status.id);
            const busy = busyId === status.id;
            const cellDisabled = !canWrite || inactive;
            const dot =
              status.badge_color?.startsWith("#")
                ? status.badge_color
                : status.color?.startsWith("#")
                  ? status.color
                  : "#94a3b8";
            return (
              <tr
                key={status.id}
                className={`border-b border-slate-50 last:border-0 ${inactive ? "opacity-55" : "hover:bg-slate-50/70"}`}
                title={
                  inactive
                    ? "Nieaktywny status — automatyczne akcje nie będą uruchamiane."
                    : undefined
                }
              >
                <td className="px-2 py-1.5 align-middle">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-1 shrink-0 rounded-sm"
                      style={{ backgroundColor: dot }}
                      aria-hidden
                    />
                    <span
                      className={`min-w-0 flex-1 truncate ${inactive ? "text-slate-400 line-through" : "font-medium text-slate-800"}`}
                    >
                      {status.name}
                    </span>
                    {typeof status.count === "number" ? (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-500">
                        {status.count}
                      </span>
                    ) : null}
                  </div>
                </td>
                {keys.map((key) => (
                  <StatusActionCell
                    key={key}
                    actionKey={key}
                    state={getEffectState(row, key)}
                    disabled={cellDisabled}
                    busy={busy}
                    tenantId={tenantId}
                    warehouseId={warehouseId}
                    entityType={entityType}
                    onToggleSimple={(enabled) => {
                      void persistRow(status, patchRowEffect(row, key, { enabled }));
                    }}
                    onSaveEmail={(next) => {
                      void persistRow(
                        status,
                        patchRowEffect(row, key, {
                          enabled: true,
                          template_id: next.template_id,
                          user_id: next.user_id ?? getEffectState(row, key).user_id,
                        }),
                      );
                    }}
                    onDisableEmail={() => {
                      void persistRow(status, patchRowEffect(row, key, { enabled: false }));
                    }}
                  />
                ))}
                <td className="px-1 py-1.5 text-center align-middle">
                  <div className="inline-flex items-center justify-center gap-0.5">
                    <IconButton
                      title="Edytuj status"
                      aria-label="Edytuj status"
                      density="compact"
                      onClick={() => onEditStatus(status.id)}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </IconButton>
                    {onDeleteStatus ? (
                      <IconButton
                        tone="danger"
                        title="Usuń status"
                        aria-label={`Usuń ${status.name}`}
                        density="compact"
                        onClick={() => onDeleteStatus(status.id)}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </IconButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
