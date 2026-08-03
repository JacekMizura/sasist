import { ShiftConductor } from "./ShiftConductor";
import { usePulpitOpsSummary } from "./usePulpitOpsSummary";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { useSupplyFlowPlan } from "../wms/supply-flow/hooks/useSupplyFlowPlan";

/** Stanowisko kierownika — przebieg zmiany, nie dashboard. */
export default function PulpitKierownikaPage() {
  const { hasActiveWarehouse, warehouseId } = useActiveWarehouseContext();
  const { board, loading, refreshing, error, refresh } = useSupplyFlowPlan(
    hasActiveWarehouse ? warehouseId : null,
  );
  const { summary: ops } = usePulpitOpsSummary(hasActiveWarehouse ? warehouseId : null);

  return (
    <ShiftConductor
      board={board}
      ops={ops}
      loading={loading}
      refreshing={refreshing}
      error={error}
      hasActiveWarehouse={hasActiveWarehouse}
      refresh={refresh}
    />
  );
}
