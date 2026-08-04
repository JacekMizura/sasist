import { ShiftConductor } from "./ShiftConductor";
import { usePulpitOpsSummary } from "./usePulpitOpsSummary";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { useSupplyFlowPlan } from "../wms/supply-flow/hooks/useSupplyFlowPlan";
import CentrumOperacyjnePage from "../centrum-operacyjne/CentrumOperacyjnePage";

/**
 * Pulpit kierownika — najpierw „co zrobić teraz”, potem zwijane sekcje operacyjne
 * (istniejący embed Centrum — bez osobnego ekranu szczegółów).
 */
export default function PulpitKierownikaPage() {
  const { hasActiveWarehouse, warehouseId } = useActiveWarehouseContext();
  const { board, loading, refreshing, error, refresh } = useSupplyFlowPlan(
    hasActiveWarehouse ? warehouseId : null,
  );
  const { summary: ops } = usePulpitOpsSummary(hasActiveWarehouse ? warehouseId : null);

  return (
    <div className="min-w-0 space-y-8">
      <ShiftConductor
        board={board}
        ops={ops}
        loading={loading}
        refreshing={refreshing}
        error={error}
        hasActiveWarehouse={hasActiveWarehouse}
        refresh={refresh}
      />
      <div className="border-t border-slate-200 pt-6">
        <CentrumOperacyjnePage embedInPulpit />
      </div>
    </div>
  );
}
