import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import {
  EDGE_DEVICE_STATUS_LABELS,
  deviceDisplayName,
  enqueueDeviceAction,
  fetchEdgeDevice,
  updateDeviceConfiguration,
  type EdgeDevice,
  type EdgeDeviceAction,
} from "../../../devices";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";

export function DeviceDetailPanel() {
  const { deviceId = "" } = useParams();
  const [device, setDevice] = useState<EdgeDevice | null>(null);
  const [cfgText, setCfgText] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState<EdgeDeviceAction | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchEdgeDevice(DAMAGE_TENANT_ID, deviceId);
      setDevice(d);
      setCfgText(JSON.stringify(d.configuration?.values ?? {}, null, 2));
      setError(null);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie znaleziono urządzenia."));
    }
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (action: string) => {
    if (!device?.agent_id) return;
    setBusy(true);
    setError(null);
    try {
      const row = await enqueueDeviceAction({
        tenantId: DAMAGE_TENANT_ID,
        agentId: device.agent_id,
        action,
        moduleId: device.module_id ?? undefined,
        deviceId: device.id,
      });
      setLastAction(row);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się zlecić akcji."));
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    if (!device) return;
    setBusy(true);
    try {
      const values = JSON.parse(cfgText) as Record<string, unknown>;
      const updated = await updateDeviceConfiguration(
        DAMAGE_TENANT_ID,
        device.id,
        values,
        device.agent_id,
      );
      setDevice(updated);
      if (device.agent_id) {
        await enqueueDeviceAction({
          tenantId: DAMAGE_TENANT_ID,
          agentId: device.agent_id,
          action: "UpdateDeviceConfiguration",
          deviceId: device.id,
          moduleId: device.module_id ?? undefined,
          parameters: { values, configuration_version: updated.configuration_version },
        });
      }
    } catch (err) {
      setError(extractApiErrorMessage(err, "Nie udało się zapisać konfiguracji."));
    } finally {
      setBusy(false);
    }
  };

  if (!device && !error) return <p className="p-4 text-sm text-slate-500">Ładowanie…</p>;
  if (!device) return <p className="p-4 text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-6 p-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">{deviceDisplayName(device)}</h2>
        <p className="text-sm text-slate-500">
          {device.type} · agent #{device.agent_id} · moduł {device.module_id}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-medium text-slate-800">Status</h3>
        <p className="text-sm">
          {EDGE_DEVICE_STATUS_LABELS[device.status as keyof typeof EDGE_DEVICE_STATUS_LABELS] ?? device.status}
          {device.last_seen ? ` · lastSeen ${device.last_seen}` : ""}
        </p>
        <p className="mt-1 text-sm text-slate-600">Health score: {device.health?.health_score ?? "—"}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-medium text-slate-800">Capabilities</h3>
        <ul className="space-y-2 text-sm">
          {(device.capabilities ?? []).map((c) => (
            <li key={`${c.name}-${c.version}`}>
              <span className="font-medium">{c.name}</span> v{c.version}:{" "}
              {(c.supported_operations ?? []).join(", ") || "—"}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-medium text-slate-800">Konfiguracja</h3>
        <textarea
          className="h-40 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs"
          value={cfgText}
          onChange={(e) => setCfgText(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveConfig()}
          className="mt-2 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Zapisz i wyślij do agenta
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 font-medium text-slate-800">Diagnostyka / Logi</h3>
        <div className="flex flex-wrap gap-2">
          {(["RefreshDevices", "RunDiagnostics", "DownloadLogs"] as const).map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:border-orange-300"
              onClick={() => void runAction(action)}
            >
              {action}
            </button>
          ))}
        </div>
        {lastAction ? (
          <pre className="mt-3 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs">
            {JSON.stringify(lastAction, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
