import { Link } from "react-router-dom";

import { useOperationsDashboard } from "../../../hooks/operations/useOperationsDashboard";
import type { FeedLine } from "../../../hooks/runtime/formatRuntimeFeedLine";
import type { OperatorSnapshot } from "../../../hooks/runtime/useOperatorRuntime";
import type { ZonePressure } from "../../../hooks/runtime/useZonePressure";
import type { OperationalAlert } from "../../../api/operationalAlertsApi";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { OperationalTimeline } from "../OperationalTimeline";
import { ActionFeedPanel } from "./ActionFeedPanel";
import { OperationsKpiStrip } from "./OperationsKpiStrip";
import { WmsConsolidationDashboardLink } from "./WmsConsolidationDashboardLink";
import { ZoneStatusPanel } from "./ZoneStatusPanel";

type Props = {
  alerts: OperationalAlert[];
  replenishmentOpen: number;
  self: OperatorSnapshot | null;
  peers: OperatorSnapshot[];
  zones: ZonePressure[];
  tasksToday: number;
  feedLines: FeedLine[];
  runtimePreview: boolean;
  onAckAlert: (id: number) => void;
};

export function OperationsPulpit({
  alerts,
  replenishmentOpen,
  self,
  peers,
  zones,
  tasksToday,
  feedLines,
  runtimePreview,
  onAckAlert,
}: Props) {
  const { kpis, actionFeed } = useOperationsDashboard({
    alerts,
    replenishmentOpen,
    self,
    peers,
    zones,
    tasksToday,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-2 md:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Pulpit</h1>
          <p className="text-xs text-slate-500">Centrum operacyjne magazynu</p>
        </div>
        <nav className="flex flex-wrap gap-1 text-xs">
          {[
            ["Uzupełnienia", WMS_ROUTES.operationsReplenishment],
            ["Zadania", WMS_ROUTES.operationsTasks],
            ["Alerty", WMS_ROUTES.operationsAlerts],
          ].map(([label, to]) => (
            <Link
              key={to}
              to={to}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {runtimePreview ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Tryb podglądu — dane mogą być niepełne. Klasyczny WMS działa bez zmian.
        </p>
      ) : null}
      <OperationsKpiStrip kpis={kpis} />
      <WmsConsolidationDashboardLink />
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <ActionFeedPanel items={actionFeed} onAckAlert={onAckAlert} />
        <aside className="w-full shrink-0 lg:w-56">
          <ZoneStatusPanel zones={zones} />
        </aside>
      </div>
      <OperationalTimeline lines={feedLines} />
    </div>
  );
}
