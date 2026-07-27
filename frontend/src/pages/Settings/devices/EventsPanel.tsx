import { useEffect, useState } from "react";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { fetchDeviceEvents, type EdgeDeviceEvent } from "../../../devices";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";

export function EventsPanel() {
  const [events, setEvents] = useState<EdgeDeviceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setEvents(await fetchDeviceEvents(DAMAGE_TENANT_ID));
      } catch (err) {
        setError(extractApiErrorMessage(err, "Nie udało się pobrać zdarzeń."));
      }
    })();
  }, []);

  return (
    <div className="space-y-3 p-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {events.map((e) => (
          <li key={e.id} className="px-3 py-2 text-sm">
            <span className="font-medium text-slate-800">{e.event_type}</span>{" "}
            <span className="text-slate-500">{e.device_id ?? "—"}</span>
            <div className="text-xs text-slate-400">{e.occurred_at}</div>
          </li>
        ))}
      </ul>
      {events.length === 0 && !error ? <p className="text-sm text-slate-500">Brak zdarzeń.</p> : null}
    </div>
  );
}
