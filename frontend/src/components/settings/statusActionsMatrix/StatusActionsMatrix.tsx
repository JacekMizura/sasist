/**
 * Sellasist-like action matrix for statuses within one subgroup.
 * STATUS_ACTION SSOT via upsert; overview map provides row state.
 */
import { useCallback, useState } from "react";
import { Info, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import {
  upsertStatusActions,
  type AutomationEntityType,
  type StatusActionOverviewEffectDto,
} from "../../../api/automationsApi";
import {
  STATUS_ACTION_COLUMN_HEADERS,
  STATUS_ACTION_COLUMN_TOOLTIPS,
  managedKeysForEntity,
  type StatusActionManagedKey,
} from "../../../utils/statusActionManagedCatalog";
import {
  buildManagedEffectsPayload,
  getEffectState,
  patchRowEffect,
  type StatusActionsRowState,
} from "../../../utils/statusActionMatrixPayload";
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
  onOverviewChanged: () => void | Promise<void>;
};

function rowFromOverview(
  map: Record<string, StatusActionOverviewEffectDto> | undefined,
): StatusActionsRowState {
  if (!map) return {};
  const out: StatusActionsRowState = {};
  for (const [k, v] of Object.entries(map)) {
    out[k as StatusActionManagedKey] = {
      enabled: Boolean(v?.enabled),
      template_id: v?.template_id ?? null,
      user_id: v?.user_id ?? null,
    };
  }
  return out;
}

export function StatusActionsMatrix({
  tenantId,
  warehouseId = null,
  entityType,
  statuses,
  actionsByStatusId,
  canWrite = true,
  onEditStatus,
  onDeleteStatus,
  onOverviewChanged,
}: Props) {
  const keys = managedKeysForEntity(entityType);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, StatusActionsRowState>>({});

  const resolveRow = useCallback(
    (statusId: number): StatusActionsRowState => {
      const sid = String(statusId);
      return optimistic[sid] ?? rowFromOverview(actionsByStatusId[sid]);
    },
    [actionsByStatusId, optimistic],
  );

  const persistRow = async (status: StatusMatrixRow, next: StatusActionsRowState) => {
    const sid = String(status.id);
    setOptimistic((prev) => ({ ...prev, [sid]: next }));
    setBusyId(status.id);
    try {
      await upsertStatusActions({
        tenant_id: tenantId,
        entity_type: entityType,
        status_id: status.id,
        warehouse_id: warehouseId,
        status_name: status.name,
        effects: buildManagedEffectsPayload(entityType, next),
      });
      await onOverviewChanged();
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
    return <p className="text-xs italic text-slate-400">Brak etykiet</p>;
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold normal-case tracking-normal text-slate-600">Status</th>
            {keys.map((key) => (
              <th
                key={key}
                className="w-28 px-2 py-2 text-center font-semibold normal-case tracking-normal text-slate-600"
                title={STATUS_ACTION_COLUMN_TOOLTIPS[key]}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  {STATUS_ACTION_COLUMN_HEADERS[key]}
                  {key === "warehouse_commit" ? (
                    <Info className="h-3 w-3 text-slate-400" strokeWidth={2} aria-hidden />
                  ) : null}
                </span>
              </th>
            ))}
            <th className="w-28 px-2 py-2 text-right font-semibold normal-case tracking-normal text-slate-600">
              Akcje
            </th>
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
                className={`border-b border-slate-50 last:border-0 ${inactive ? "opacity-55" : "hover:bg-slate-50/60"}`}
                title={
                  inactive
                    ? "Nieaktywny status — automatyczne akcje nie będą uruchamiane."
                    : undefined
                }
              >
                <td className="px-3 py-2 align-middle">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-1 shrink-0 rounded-sm"
                      style={{ backgroundColor: dot }}
                      aria-hidden
                    />
                    <span
                      className={`min-w-0 flex-1 truncate font-medium ${inactive ? "text-slate-400 line-through" : "text-slate-800"}`}
                    >
                      {status.name}
                    </span>
                    {typeof status.count === "number" ? (
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">{status.count}</span>
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
                    onToggleWarehouse={(enabled) => {
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
                <td className="px-2 py-2 text-right align-middle">
                  <div className="inline-flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      onClick={() => onEditStatus(status.id)}
                    >
                      <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden />
                      Edytuj
                    </button>
                    {onDeleteStatus ? (
                      <button
                        type="button"
                        className="inline-flex items-center rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Usuń ${status.name}`}
                        onClick={() => onDeleteStatus(status.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
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
