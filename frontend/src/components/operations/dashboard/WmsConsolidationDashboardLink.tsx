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
  const [summary, setSummary] = useState<{ pending: number; inProgress: number; completed: number } | null>(
    null,
  );

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
        }),
      )
      .catch(() => setSummary(null));
  }, [warehouseId]);

  if (summary == null || summary.pending + summary.inProgress + summary.completed === 0) {
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
        <span>Gotowe: {summary.completed}</span>
      </div>
    </Link>
  );
}
