import { useCallback, useEffect, useState } from "react";

import { type LiveEvent, type OperatorContext } from "../../api/operationalRuntimeApi";
import { listWmsOperationalTasks, type WmsOperationalTaskApi } from "../../api/wmsOperationalTasksApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useAuth } from "../../context/AuthContext";
import { operatorActivityLabel } from "../../services/operations/operationsTerminology";
import { safeDisplay, safeTrim } from "../../utils/safeStrings";
import { useOperationalRuntime } from "./useOperationalRuntime";

export type OperatorSnapshot = {
  operatorUserId: number;
  displayName: string;
  contextType: string;
  cartId: number | null;
  zoneLabel: string;
  activeTaskId: number | null;
  idleLabel: string;
};

function idleLabelFrom(updatedAt?: string | null): string {
  if (!updatedAt) return "—";
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "<1 min";
  return `${min} min`;
}

export function useOperatorRuntime() {
  const { user } = useAuth();
  const { warehouseId, runtimeAvailable, subscribe } = useOperationalRuntime();
  const [selfContext, setSelfContext] = useState<OperatorContext | null>(null);
  const [activeTasks, setActiveTasks] = useState<WmsOperationalTaskApi[]>([]);

  const refresh = useCallback(async () => {
    if (warehouseId == null) return;
    try {
      const res = await listWmsOperationalTasks(DAMAGE_TENANT_ID, warehouseId, {
        limit: 30,
        sync: true,
      });
      setActiveTasks(res.items.filter((t) => t.status === "in_progress" || t.status === "open"));
    } catch {
      setActiveTasks([]);
    }
  }, [warehouseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribe((ev: LiveEvent) => {
      if (ev.event_type === "runtime.context.updated") {
        const p = ev.payload;
        if (user?.id && p.operator_user_id === user.id) {
          setSelfContext({
            operator_user_id: user.id,
            context_type: String(p.context_type ?? "PICKING"),
            cart_id: typeof p.cart_id === "number" ? p.cart_id : null,
            zone_id: typeof p.zone_id === "number" ? p.zone_id : null,
            active_task_id: typeof p.active_task_id === "number" ? p.active_task_id : null,
            updated_at: ev.created_at ?? null,
          });
        }
      }
      if (ev.event_type.startsWith("task.")) void refresh();
    });
  }, [subscribe, refresh, user?.id]);

  const selfSnapshot: OperatorSnapshot | null = user
    ? {
        operatorUserId: user.id,
        displayName:
          [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
          user.login ||
          `Operator #${user.id}`,
        contextType: operatorActivityLabel(selfContext?.context_type ?? "IDLE"),
        cartId: selfContext?.cart_id ?? null,
        zoneLabel: selfContext?.zone_id ? `Strefa #${selfContext.zone_id}` : "—",
        activeTaskId: selfContext?.active_task_id ?? null,
        idleLabel: idleLabelFrom(selfContext?.updated_at),
      }
    : null;

  const peers: OperatorSnapshot[] = activeTasks
    .filter((t) => safeTrim(t.summary_line))
    .slice(0, 8)
    .map((t, i) => ({
      operatorUserId: i + 1,
      displayName: safeTrim(safeTrim(t.summary_line).split("·")[0]) || `Zadanie #${t.id}`,
      contextType: operatorActivityLabel(t.task_type),
      cartId: null,
      zoneLabel: safeDisplay(t.location_hint),
      activeTaskId: t.id,
      idleLabel: idleLabelFrom(t.updated_at),
    }));

  return { selfSnapshot, peers, runtimeAvailable, refresh };
}
