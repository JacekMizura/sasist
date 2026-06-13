import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PackageCheck } from "lucide-react";

import { fetchWmsConsolidationSummary } from "../../../api/wmsConsolidationApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";

export function WmsConsolidationDashboardLink() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [summary, setSummary] = useState<{
    pending: number;
    inProgress: number;
    completed: number;
    problems: number;
    decisions: number;
    criticalAlerts: number;
  } | null>(null);

  useEffect(() => {
    if (warehouseId == null || warehouseId <= 0) {
      setSummary(null);
      return;
    }
    void fetchWmsConsolidationSummary(DAMAGE_TENANT_ID, warehouseId)
      .then((data) =>
        setSummary({
          pending: data.pending_count,
          inProgress: data.in_progress_count,
          completed: data.completed_count,
          problems: data.problem_plan_count,
          decisions: data.manual_review_count,
          criticalAlerts: data.critical_alert_count,
        }),
      )
      .catch(() => setSummary(null));
  }, [warehouseId]);

  if (summary == null || summary.pending + summary.inProgress + summary.completed + summary.problems === 0) {
    return null;
  }

  return (
    <Link
      to={WMS_ROUTES.consolidations}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50/70 px-4 py-3 text-sm shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50"
    >
      <div className="flex items-center gap-2 font-semibold text-cyan-950">
        <PackageCheck className="h-5 w-5 shrink-0" aria-hidden />
        Konsolidacje
      </div>
      <div className="flex flex-wrap gap-3 text-xs font-medium text-cyan-900">
        <span>Oczekujące: {summary.pending}</span>
        <span>W toku: {summary.inProgress}</span>
        {summary.problems > 0 ? <span className="text-orange-900">Z problemami: {summary.problems}</span> : null}
        {summary.decisions > 0 ? <span className="text-violet-900">Decyzje: {summary.decisions}</span> : null}
        {summary.criticalAlerts > 0 ? (
          <span className="text-red-900">Krytyczne alerty: {summary.criticalAlerts}</span>
        ) : null}
        <span>Gotowe: {summary.completed}</span>
      </div>
    </Link>
  );
}
