import { AlertsFeed } from "../../../components/operations/alerts/AlertsFeed";
import { useOperationalAlerts } from "../../../hooks/runtime/useOperationalAlerts";
import { useReplenishmentRealtime } from "../../../hooks/replenishment/useReplenishmentRealtime";

export default function OperationsAlertsPage() {
  const { alerts, ack, runtimeAvailable } = useOperationalAlerts();
  const { runScan } = useReplenishmentRealtime();

  return (
    <div className="space-y-3 p-2 md:p-3">
      <header>
        <h1 className="text-lg font-semibold text-slate-900">Alerty</h1>
        <p className="text-xs text-slate-500">Sytuacje wymagające natychmiastowej reakcji</p>
      </header>
      {!runtimeAvailable ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Alerty na żywo wymagają włączonego centrum operacyjnego. Klasyczny WMS bez zmian.
        </p>
      ) : null}
      <AlertsFeed
        alerts={alerts}
        onAck={(id) => void ack(id)}
        onCreateReplenishment={() => void runScan()}
        onEscalate={() => {}}
      />
    </div>
  );
}
