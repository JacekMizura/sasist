import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { useWarehouse } from "../../../context/WarehouseContext";
import {
  EDGE_DEVICE_STATUS_LABELS,
  EDGE_DEVICE_TYPE_LABELS,
  deviceDisplayName,
  fetchEdgeDevices,
  type EdgeDevice,
} from "../../../devices";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { DEVICES_SETTINGS_BASE } from "./constants";

export function InventoryPanel() {
  const { warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const warehouseId = showWarehouseSelector ? activeWarehouse?.id ?? null : activeWarehouse?.id ?? null;
  const [rows, setRows] = useState<EdgeDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const agentFilter = new URLSearchParams(window.location.search).get("agent");

  const load = useCallback(async () => {
    try {
      const data = await fetchEdgeDevices({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
        agentId: agentFilter ? Number(agentFilter) : null,
      });
      setRows(data);
      setError(null);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się pobrać urządzeń."));
    }
  }, [warehouseId, agentFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3 p-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Urządzenie</th>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Health</th>
              <th className="px-3 py-2">Agent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={`${d.agent_id}-${d.id}`}
                className="cursor-pointer border-t border-slate-100 hover:bg-orange-50/40"
                onClick={() => navigate(`${DEVICES_SETTINGS_BASE}/device/${encodeURIComponent(d.id)}`)}
              >
                <td className="px-3 py-2 font-medium text-slate-900">{deviceDisplayName(d)}</td>
                <td className="px-3 py-2 text-slate-600">
                  {EDGE_DEVICE_TYPE_LABELS[d.type as keyof typeof EDGE_DEVICE_TYPE_LABELS] ?? d.type}
                </td>
                <td className="px-3 py-2">
                  {EDGE_DEVICE_STATUS_LABELS[d.status as keyof typeof EDGE_DEVICE_STATUS_LABELS] ?? d.status}
                </td>
                <td className="px-3 py-2">{d.health?.health_score ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{d.agent_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-slate-500">Brak urządzeń w rejestrze.</p> : null}
      </div>
    </div>
  );
}
