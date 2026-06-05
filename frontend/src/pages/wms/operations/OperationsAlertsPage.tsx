import { AlertsPanel } from "../../../components/operations/AlertsPanel";
import { useOperationalAlerts } from "../../../hooks/runtime/useOperationalAlerts";

export default function OperationsAlertsPage() {
  const { alerts, ack, runtimeAvailable } = useOperationalAlerts();

  return (
    <div className="space-y-3 p-3">
      <h1 className="text-base font-semibold text-slate-900">Centrum alertów</h1>
      {!runtimeAvailable ? (
        <p className="text-sm text-slate-500">Alerty live wymagają FEATURE_OPERATIONAL_RUNTIME.</p>
      ) : null}
      <AlertsPanel alerts={alerts} onAck={(id) => void ack(id)} />
    </div>
  );
}
