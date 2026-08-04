import { ShiftConductor } from "./ShiftConductor";
import { usePulpitOpsSummary } from "./usePulpitOpsSummary";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { useSupplyFlowPlan } from "../wms/supply-flow/hooks/useSupplyFlowPlan";
import CentrumOperacyjnePage from "../centrum-operacyjne/CentrumOperacyjnePage";

/**
 * Pulpit kierownika — decyzja teraz (ShiftConductor), potem zwijane sekcje operacyjne.
 * Shell = AnalizyModuleLayout → PageLayout (Layout 2.0).
 */
export default function PulpitKierownikaPage() {
  const { hasActiveWarehouse, warehouseId } = useActiveWarehouseContext();
  const { board, loading, refreshing, error, refresh } = useSupplyFlowPlan(
    hasActiveWarehouse ? warehouseId : null,
  );
  const { summary: ops } = usePulpitOpsSummary(hasActiveWarehouse ? warehouseId : null);

  return (
    <div className="min-w-0 space-y-4">
      <ShiftConductor
        board={board}
        ops={ops}
        loading={loading}
        refreshing={refreshing}
        error={error}
        hasActiveWarehouse={hasActiveWarehouse}
        refresh={refresh}
      />
      <div className="border-t border-slate-100 pt-4">
        <CentrumOperacyjnePage embedInPulpit />
      </div>
    </div>
  );
}
