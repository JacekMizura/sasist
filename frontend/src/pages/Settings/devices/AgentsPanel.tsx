import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import { fetchEdgeModules, type EdgeModule } from "../../../devices";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { DEVICES_SETTINGS_BASE } from "./constants";

export function AgentsPanel() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = showWarehouseSelector ? activeWarehouse?.id ?? null : activeWarehouse?.id ?? null;
  const [modules, setModules] = useState<EdgeModule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        setModules(await fetchEdgeModules(DAMAGE_TENANT_ID, warehouseId));
      } catch (err) {
        setError(extractApiErrorMessage(err, "Nie udało się pobrać agentów."));
      }
    })();
  }, [warehouseId]);

  const byAgent = useMemo(() => {
    const map = new Map<number, EdgeModule[]>();
    for (const m of modules) {
      const list = map.get(m.agent_id) ?? [];
      list.push(m);
      map.set(m.agent_id, list);
    }
    return map;
  }, [modules]);

  return (
    <div className="space-y-4 p-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {[...byAgent.entries()].map(([agentId, mods]) => {
        const head = mods[0];
        return (
          <button
            key={agentId}
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-orange-300"
            onClick={() => navigate(`${DEVICES_SETTINGS_BASE}/inventory?agent=${agentId}`)}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{head?.agent_name ?? `Agent #${agentId}`}</div>
                <div className="text-xs text-slate-500">{head?.machine_id}</div>
              </div>
              <span className={head?.is_online ? "text-sm text-emerald-600" : "text-sm text-slate-400"}>
                {head?.is_online ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-2 text-sm text-slate-600">
              Moduły: {mods.map((m) => `${m.id} (${m.device_count})`).join(", ")}
            </div>
          </button>
        );
      })}
      {byAgent.size === 0 && !error ? (
        <p className="text-sm text-slate-500">Brak agentów. Zainstaluj Sasist Agent na PC w magazynie.</p>
      ) : null}
    </div>
  );
}
